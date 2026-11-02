//! Quotas: uploading stops at the limit, and removing files frees space.

mod common;

use std::io::Cursor;

use common::{TestClient, pool, unique_email};
use image::{DynamicImage, ImageFormat};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";
const MEDIA_DIR: &str = "var/test-media";
const QUOTA_BYTES: i64 = 200 * 1024 * 1024;

fn png(width: u32, height: u32) -> Vec<u8> {
    let image = DynamicImage::new_rgb8(width, height);
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("encode png");

    bytes
}

async fn logged_in() -> (TestClient, String, String, uuid::Uuid) {
    let client = TestClient::new().await;
    let email = unique_email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Quota" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");
    let user_id = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("uuid");

    (client, email, cookie, user_id)
}

async fn upload(client: &TestClient, cookie: &str) -> common::TestResponse {
    client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "photo.png",
            "image/png",
            &png(800, 600),
            cookie,
        )
        .await
}

#[tokio::test]
async fn uploads_stop_at_the_quota_and_resume_when_space_is_freed() {
    let (client, email, cookie, user_id) = logged_in().await;
    let pool = pool().await;

    // Occupy the whole quota with a row: only the sum matters here.
    sqlx::query(
        "insert into uploads
             (id, user_id, mime, size_bytes, sha256, storage_key, total_bytes)
         values ($1, $2, 'image/png', 1, '\\x00', 'fake/quota/row', $3)",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(user_id)
    .bind(QUOTA_BYTES)
    .execute(&pool)
    .await
    .expect("fake upload row");

    let rejected = upload(&client, &cookie).await;
    assert_eq!(rejected.status, 413, "body: {}", rejected.body);
    assert_eq!(rejected.body["error"]["code"], "payload_too_large");
    let message = rejected.body["error"]["message"].as_str().expect("message");
    assert!(
        message.contains("storage limit exceeded") && message.contains("200 of 200 MB"),
        "message: {message}"
    );

    // Removing the occupying row frees the quota again.
    sqlx::query("delete from uploads where user_id = $1 and storage_key = 'fake/quota/row'")
        .bind(user_id)
        .execute(&pool)
        .await
        .expect("remove fake row");

    let accepted = upload(&client, &cookie).await;
    assert_eq!(accepted.status, 201, "body: {}", accepted.body);

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn removing_a_cover_frees_the_quota() {
    let (client, email, cookie, user_id) = logged_in().await;
    let pool = pool().await;

    let uploaded = upload(&client, &cookie).await;
    assert_eq!(uploaded.status, 201);
    let upload_id = uploaded.body["upload"]["id"].as_str().expect("upload id");

    let item = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Dune", "status": "done" }),
            &cookie,
        )
        .await;
    let item_id = item.body["item"]["id"].as_str().expect("item id");

    client
        .post_with_cookie(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({ "upload_id": upload_id }),
            &cookie,
        )
        .await;

    let used_with_cover: i64 = sqlx::query_scalar(
        "select coalesce(sum(total_bytes), 0)::bigint from uploads where user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .expect("sum");
    assert!(used_with_cover > 0);

    client
        .delete(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({}),
            &cookie,
        )
        .await;

    let used_after: i64 = sqlx::query_scalar(
        "select coalesce(sum(total_bytes), 0)::bigint from uploads where user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .expect("sum");
    assert_eq!(used_after, 0, "cover removal frees the quota");

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}
