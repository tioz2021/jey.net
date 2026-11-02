//! Uploads: the format is checked by content, decoded and resized.

mod common;

use std::io::Cursor;

use common::{TestClient, unique_email};
use image::{DynamicImage, ImageFormat};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";
const MEDIA_DIR: &str = "var/test-media";

fn encoded(format: ImageFormat, width: u32, height: u32) -> Vec<u8> {
    let image = DynamicImage::new_rgb8(width, height);
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), format)
        .expect("encode image");

    bytes
}

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

fn cleanup_files(user_id: uuid::Uuid) {
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn accepts_png_jpeg_and_webp_and_creates_renditions() {
    let (client, email, cookie, user_id) = logged_in().await;

    for (name, format, mime) in [
        ("photo.png", ImageFormat::Png, "image/png"),
        ("photo.jpg", ImageFormat::Jpeg, "image/jpeg"),
        ("photo.webp", ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = encoded(format, 800, 600);

        let response = client
            .post_multipart_with_cookie("/api/v1/uploads", name, mime, &bytes, &cookie)
            .await;

        assert_eq!(
            response.status, 201,
            "file: {name}, body: {}",
            response.body
        );
        assert_eq!(response.body["upload"]["mime"], mime);
        assert_eq!(response.body["upload"]["width"], 800);
        assert_eq!(response.body["upload"]["height"], 600);

        let id = response.body["upload"]["id"].as_str().expect("id");
        for suffix in ["large.webp", "preview.webp"] {
            let path = format!("{MEDIA_DIR}/u/{user_id}/{id}/{suffix}");
            let size = std::fs::metadata(&path)
                .unwrap_or_else(|_| panic!("missing rendition {path}"))
                .len();
            assert!(size > 0, "empty rendition {path}");
        }
    }

    client.cleanup(&email).await;
    cleanup_files(user_id);
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
    cleanup_files(user_id);
}

#[tokio::test]
async fn rejects_a_broken_image_with_the_right_signature() {
    let (client, email, cookie, user_id) = logged_in().await;

    let mut broken = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    broken.extend_from_slice(b"not really a png");

    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "broken.png",
            "image/png",
            &broken,
            &cookie,
        )
        .await;

    assert_eq!(response.status, 415, "body: {}", response.body);

    client.cleanup(&email).await;
    cleanup_files(user_id);
}

#[tokio::test]
async fn rejects_files_above_ten_megabytes() {
    let (client, email, cookie, user_id) = logged_in().await;

    let mut big = encoded(ImageFormat::Png, 200, 200);
    big.resize(11 * 1024 * 1024, 0);

    let response = client
        .post_multipart_with_cookie("/api/v1/uploads", "big.png", "image/png", &big, &cookie)
        .await;

    assert_eq!(response.status, 413, "body: {}", response.body);
    assert_eq!(response.body["error"]["code"], "payload_too_large");

    client.cleanup(&email).await;
    cleanup_files(user_id);
}

#[tokio::test]
async fn requires_a_session() {
    let client = TestClient::new().await;

    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "photo.png",
            "image/png",
            &encoded(ImageFormat::Png, 40, 40),
            "",
        )
        .await;

    assert_eq!(response.status, 401);
}

#[tokio::test]
async fn downscales_a_large_photo_and_keeps_the_large_rendition_small() {
    let (client, email, cookie, user_id) = logged_in().await;

    // A 3000×2000 photo: closer to a real camera file than the tiny fixtures.
    let bytes = encoded(ImageFormat::Jpeg, 3000, 2000);

    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "big-photo.jpg",
            "image/jpeg",
            &bytes,
            &cookie,
        )
        .await;

    assert_eq!(response.status, 201, "body: {}", response.body);
    assert_eq!(response.body["upload"]["width"], 3000);
    assert_eq!(response.body["upload"]["height"], 2000);

    let id = response.body["upload"]["id"].as_str().expect("id");
    let large_path = format!("{MEDIA_DIR}/u/{user_id}/{id}/large.webp");
    let preview_path = format!("{MEDIA_DIR}/u/{user_id}/{id}/preview.webp");

    let large = image::open(&large_path).expect("large rendition is a valid image");
    assert_eq!((large.width(), large.height()), (1200, 800));

    let preview = image::open(&preview_path).expect("preview is a valid image");
    assert_eq!((preview.width(), preview.height()), (400, 267));

    let size = std::fs::metadata(&large_path).expect("large file").len();
    assert!(size < 300 * 1024, "large rendition is {size} bytes");

    client.cleanup(&email).await;
    cleanup_files(user_id);
}
