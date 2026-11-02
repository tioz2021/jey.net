//! Uploads: the format is checked by content, and limits are enforced.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";

const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
];

const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46];

const WEBP: &[u8] = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00";

async fn logged_in() -> (TestClient, String, String, uuid::Uuid) {
    let client = TestClient::new().await;
    let email = unique_email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Uploader" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");
    let user_id = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("uuid");

    (client, email, cookie, user_id)
}

#[tokio::test]
async fn accepts_png_jpeg_and_webp() {
    let (client, email, cookie, user_id) = logged_in().await;

    for (name, mime, bytes, expected) in [
        ("photo.png", "image/png", PNG, "image/png"),
        ("photo.jpg", "image/jpeg", JPEG, "image/jpeg"),
        ("photo.webp", "image/webp", WEBP, "image/webp"),
    ] {
        let response = client
            .post_multipart_with_cookie("/api/v1/uploads", name, mime, bytes, &cookie)
            .await;

        assert_eq!(
            response.status, 201,
            "file: {name}, body: {}",
            response.body
        );
        assert_eq!(response.body["upload"]["mime"], expected);
        assert_eq!(response.body["upload"]["size_bytes"], bytes.len());
    }

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("var/test-uploads/{user_id}"));
}

#[tokio::test]
async fn rejects_text_renamed_as_an_image() {
    let (client, email, cookie, user_id) = logged_in().await;

    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "photo.jpg",
            "image/jpeg",
            b"this is plain text, not a photo",
            &cookie,
        )
        .await;

    assert_eq!(response.status, 415, "body: {}", response.body);
    assert_eq!(response.body["error"]["code"], "unsupported_media_type");

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("var/test-uploads/{user_id}"));
}

#[tokio::test]
async fn rejects_files_above_ten_megabytes() {
    let (client, email, cookie, _user_id) = logged_in().await;

    let mut big = PNG.to_vec();
    big.resize(11 * 1024 * 1024, 0);

    let response = client
        .post_multipart_with_cookie("/api/v1/uploads", "big.png", "image/png", &big, &cookie)
        .await;

    assert_eq!(response.status, 413, "body: {}", response.body);
    assert_eq!(response.body["error"]["code"], "payload_too_large");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn requires_a_session() {
    let client = TestClient::new().await;

    let response = client
        .post_multipart_with_cookie("/api/v1/uploads", "photo.png", "image/png", PNG, "")
        .await;

    assert_eq!(response.status, 401);
}
