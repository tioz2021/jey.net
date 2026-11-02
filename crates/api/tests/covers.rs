//! Covers: an upload becomes the item's image, and replacing it frees the files.

mod common;

use std::io::Cursor;

use common::{TestClient, unique_email};
use image::{DynamicImage, ImageFormat};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";
const MEDIA_DIR: &str = "var/test-media";

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
            json!({ "email": email, "password": PASSWORD, "display_name": "Cover" }),
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

async fn create_item(client: &TestClient, cookie: &str) -> String {
    let response = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Interstellar", "status": "done" }),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);

    response.body["item"]["id"].as_str().expect("id").to_owned()
}

async fn upload(client: &TestClient, cookie: &str, width: u32) -> String {
    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "cover.png",
            "image/png",
            &png(width, width * 3 / 4),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);

    response.body["upload"]["id"]
        .as_str()
        .expect("upload id")
        .to_owned()
}

fn rendition_path(user_id: uuid::Uuid, upload_id: &str, file: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(format!("{MEDIA_DIR}/u/{user_id}/{upload_id}/{file}"))
}

#[tokio::test]
async fn attaching_replacing_and_removing_a_cover() {
    let (client, email, cookie, user_id) = logged_in().await;
    let item_id = create_item(&client, &cookie).await;

    let first_upload = upload(&client, &cookie, 800).await;
    let first_large = rendition_path(user_id, &first_upload, "large.webp");
    assert!(first_large.exists());

    let attached = client
        .post_with_cookie(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({ "upload_id": first_upload }),
            &cookie,
        )
        .await;
    assert_eq!(attached.status, 200, "body: {}", attached.body);
    let first_key = attached.body["item"]["cover_key"]
        .as_str()
        .expect("cover key")
        .to_owned();
    assert!(first_key.ends_with("large.webp"));

    // Replacing the cover deletes the previous upload and its files.
    let second_upload = upload(&client, &cookie, 900).await;
    let replaced = client
        .post_with_cookie(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({ "upload_id": second_upload }),
            &cookie,
        )
        .await;
    assert_eq!(replaced.status, 200);
    let second_key = replaced.body["item"]["cover_key"].as_str().expect("key");
    assert_ne!(first_key, second_key);
    assert!(!first_large.exists(), "old cover file is gone");
    assert!(rendition_path(user_id, &second_upload, "large.webp").exists());

    // Removing the cover frees the current files too.
    let cleared = client
        .delete(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(cleared.status, 200, "body: {}", cleared.body);
    assert!(cleared.body["item"]["cover_key"].is_null());
    assert!(!rendition_path(user_id, &second_upload, "large.webp").exists());

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn another_accounts_upload_cannot_be_used_as_a_cover() {
    let (client, email, cookie, user_id) = logged_in().await;
    let item_id = create_item(&client, &cookie).await;

    let (stranger, stranger_email, stranger_cookie, stranger_id) = logged_in().await;
    let foreign_upload = upload(&stranger, &stranger_cookie, 640).await;

    let response = client
        .post_with_cookie(
            &format!("/api/v1/items/{item_id}/cover"),
            json!({ "upload_id": foreign_upload }),
            &cookie,
        )
        .await;

    assert_eq!(response.status, 404, "body: {}", response.body);

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
    for id in [user_id, stranger_id] {
        let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{id}"));
    }
}

#[tokio::test]
async fn cover_endpoints_require_a_session() {
    let client = TestClient::new().await;

    let response = client
        .post(
            "/api/v1/items/00000000-0000-0000-0000-000000000000/cover",
            json!({ "upload_id": "00000000-0000-0000-0000-000000000000" }),
        )
        .await;

    assert_eq!(response.status, 401);
}
