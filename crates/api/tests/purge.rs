//! Account purge: old anonymised accounts lose their rows and media files.

mod common;

use std::io::Cursor;
use std::path::Path;

use common::{TestClient, unique_email};
use image::{DynamicImage, ImageFormat};
use jey_api::media::LocalStorage;
use jey_api::users::purge;
use serde_json::json;

const PASSWORD: &str = "correct horse battery";
const MEDIA_DIR: &str = "var/test-media";

fn png() -> Vec<u8> {
    let image = DynamicImage::new_rgb8(400, 300);
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("encode png");

    bytes
}

#[tokio::test]
async fn purges_old_accounts_with_their_items_and_files() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Old" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("uuid");

    let upload = client
        .post_multipart_with_cookie("/api/v1/uploads", "old.png", "image/png", &png(), &cookie)
        .await;
    assert_eq!(upload.status, 201, "body: {}", upload.body);
    let upload_id: uuid::Uuid = upload.body["upload"]["id"]
        .as_str()
        .expect("upload id")
        .parse()
        .expect("uuid");

    let (storage_key, large_key, preview_key) = sqlx::query_as::<_, (String, String, String)>(
        "select storage_key, large_key, preview_key from uploads where id = $1",
    )
    .bind(upload_id)
    .fetch_one(client.pool())
    .await
    .expect("upload keys");

    for key in [&storage_key, &large_key, &preview_key] {
        assert!(
            Path::new(MEDIA_DIR).join(key).is_file(),
            "missing uploaded file {key}"
        );
    }

    let item = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "image", "title": "Old cover", "status": "done" }),
            &cookie,
        )
        .await;
    let item_id: uuid::Uuid = item.body["item"]["id"]
        .as_str()
        .expect("item id")
        .parse()
        .expect("uuid");

    sqlx::query("update items set cover_key = $1 where id = $2")
        .bind(&large_key)
        .bind(item_id)
        .execute(client.pool())
        .await
        .expect("cover is set");

    sqlx::query("update users set deleted_at = now() - interval '31 days' where id = $1")
        .bind(user_id)
        .execute(client.pool())
        .await
        .expect("user is marked deleted");

    let storage = LocalStorage::new(MEDIA_DIR);
    let report = purge::run(client.pool(), &storage, 30)
        .await
        .expect("purge runs");

    assert_eq!(report.users_deleted, 1);
    assert!(report.files_deleted >= 3, "files: {}", report.files_deleted);

    let user_left: Option<uuid::Uuid> = sqlx::query_scalar("select id from users where id = $1")
        .bind(user_id)
        .fetch_optional(client.pool())
        .await
        .expect("query user");
    assert!(user_left.is_none(), "user row should be gone");

    let item_left: Option<uuid::Uuid> = sqlx::query_scalar("select id from items where id = $1")
        .bind(item_id)
        .fetch_optional(client.pool())
        .await
        .expect("query item");
    assert!(item_left.is_none(), "item should be gone");

    for key in [&storage_key, &large_key, &preview_key] {
        assert!(
            !Path::new(MEDIA_DIR).join(key).is_file(),
            "file should be gone: {key}"
        );
    }

    client.cleanup(&email).await;
}
