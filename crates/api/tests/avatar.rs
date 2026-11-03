//! Avatars: a square 128 px WebP, replacing and removing the old file.

mod common;

use std::io::Cursor;

use common::{TestClient, unique_email};
use image::{DynamicImage, ImageFormat};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";
const MEDIA_DIR: &str = "var/test-media";

fn image_bytes(width: u32, height: u32) -> Vec<u8> {
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
            json!({ "email": email, "password": PASSWORD, "display_name": "Avatar" }),
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

async fn upload(client: &TestClient, cookie: &str, width: u32, height: u32) -> String {
    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "photo.png",
            "image/png",
            &image_bytes(width, height),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);

    response.body["upload"]["id"]
        .as_str()
        .expect("upload id")
        .to_owned()
}

#[tokio::test]
async fn avatar_is_square_and_replacing_removes_the_old_file() {
    let (client, email, cookie, user_id) = logged_in().await;

    let first_upload = upload(&client, &cookie, 400, 400).await;
    let first = client
        .post_with_cookie(
            "/api/v1/me/avatar",
            json!({ "upload_id": first_upload }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, 200, "body: {}", first.body);

    let first_key = first.body["user"]["avatar_key"]
        .as_str()
        .expect("avatar key")
        .to_owned();
    let first_path = format!("{MEDIA_DIR}/{first_key}");
    let decoded = image::open(&first_path).expect("avatar file");
    assert_eq!((decoded.width(), decoded.height()), (128, 128));

    // A wide photo is cropped, not stretched.
    let second_upload = upload(&client, &cookie, 600, 300).await;
    let second = client
        .post_with_cookie(
            "/api/v1/me/avatar",
            json!({ "upload_id": second_upload }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, 200);

    let second_key = second.body["user"]["avatar_key"]
        .as_str()
        .expect("avatar key")
        .to_owned();
    assert_ne!(first_key, second_key);
    assert!(
        !std::path::Path::new(&first_path).exists(),
        "old avatar removed"
    );

    let decoded = image::open(format!("{MEDIA_DIR}/{second_key}")).expect("avatar file");
    assert_eq!((decoded.width(), decoded.height()), (128, 128));

    // The owner can fetch it through the media route.
    let (status, headers, _) = client
        .get_bytes(&format!("/media/{second_key}"), Some(&cookie), &[])
        .await;
    assert_eq!(status, 200);
    assert_eq!(headers["content-type"], "image/webp");

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn avatar_can_be_removed() {
    let (client, email, cookie, user_id) = logged_in().await;
    let upload_id = upload(&client, &cookie, 300, 300).await;

    let set = client
        .post_with_cookie(
            "/api/v1/me/avatar",
            json!({ "upload_id": upload_id }),
            &cookie,
        )
        .await;
    let key = set.body["user"]["avatar_key"]
        .as_str()
        .expect("key")
        .to_owned();
    let path = format!("{MEDIA_DIR}/{key}");

    let cleared = client.delete("/api/v1/me/avatar", json!({}), &cookie).await;
    assert_eq!(cleared.status, 200);
    assert!(cleared.body["user"]["avatar_key"].is_null());
    assert!(!std::path::Path::new(&path).exists());

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn another_accounts_upload_cannot_become_an_avatar() {
    let (client, email, cookie, user_id) = logged_in().await;
    let (stranger, stranger_email, stranger_cookie, stranger_id) = logged_in().await;

    let foreign_upload = upload(&stranger, &stranger_cookie, 200, 200).await;

    let response = client
        .post_with_cookie(
            "/api/v1/me/avatar",
            json!({ "upload_id": foreign_upload }),
            &cookie,
        )
        .await;
    assert_eq!(response.status, 404);

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
    for id in [user_id, stranger_id] {
        let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{id}"));
    }
}

#[tokio::test]
async fn banner_is_wide_and_can_be_removed() {
    let (client, email, cookie, user_id) = logged_in().await;
    let upload_id = upload(&client, &cookie, 900, 300).await;

    let set = client
        .post_with_cookie(
            "/api/v1/me/banner",
            json!({ "upload_id": upload_id }),
            &cookie,
        )
        .await;
    assert_eq!(set.status, 200, "body: {}", set.body);

    let key = set.body["user"]["banner_key"]
        .as_str()
        .expect("banner key")
        .to_owned();
    assert!(key.contains("/banner/"));

    let decoded = image::open(format!("{MEDIA_DIR}/{key}")).expect("banner file");
    assert_eq!((decoded.width(), decoded.height()), (1200, 300));

    let (status, headers, _) = client
        .get_bytes(&format!("/media/{key}"), Some(&cookie), &[])
        .await;
    assert_eq!(status, 200);
    assert_eq!(headers["content-type"], "image/webp");

    let cleared = client.delete("/api/v1/me/banner", json!({}), &cookie).await;
    assert_eq!(cleared.status, 200);
    assert!(cleared.body["user"]["banner_key"].is_null());
    let path = format!("{MEDIA_DIR}/{key}");
    assert!(!std::path::Path::new(&path).exists());

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}
