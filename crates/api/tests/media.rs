//! Media delivery: owner-only access, caching headers and ETag revalidation.

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
            json!({ "email": email, "password": PASSWORD, "display_name": "Viewer" }),
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

async fn upload(client: &TestClient, cookie: &str) -> String {
    let response = client
        .post_multipart_with_cookie(
            "/api/v1/uploads",
            "cover.png",
            "image/png",
            &png(800, 600),
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
async fn owner_gets_the_file_with_cache_headers_and_304() {
    let (client, email, cookie, user_id) = logged_in().await;
    let upload_id = upload(&client, &cookie).await;
    let key = format!("u/{user_id}/{upload_id}/large.webp");

    let (status, headers, bytes) = client
        .get_bytes(&format!("/media/{key}"), Some(&cookie), &[])
        .await;

    assert_eq!(status, 200);
    assert_eq!(headers["content-type"], "image/webp");
    assert_eq!(
        headers["cache-control"],
        "public, max-age=31536000, immutable"
    );
    let etag = headers["etag"].to_str().expect("etag").to_owned();
    assert!(etag.starts_with('"'));
    assert!(!bytes.is_empty());

    // A second request with the same ETag is not sent the body again.
    let (status, headers, bytes) = client
        .get_bytes(
            &format!("/media/{key}"),
            Some(&cookie),
            &[("if-none-match", etag.as_str())],
        )
        .await;

    assert_eq!(status, 304);
    assert_eq!(headers["etag"], etag.as_str());
    assert!(bytes.is_empty());

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn another_account_cannot_read_private_media() {
    let (client, email, cookie, user_id) = logged_in().await;
    let upload_id = upload(&client, &cookie).await;
    let key = format!("u/{user_id}/{upload_id}/large.webp");
    // Profiles are public by default; make this one private on purpose.
    let hidden = client
        .patch("/api/v1/me", json!({ "is_public": false }), &cookie)
        .await;
    assert_eq!(hidden.status, 200, "body: {}", hidden.body);

    let (stranger, stranger_email, stranger_cookie, stranger_id) = logged_in().await;

    let (status, _, _) = stranger
        .get_bytes(&format!("/media/{key}"), Some(&stranger_cookie), &[])
        .await;
    assert_eq!(status, 403);

    let (status, _, _) = stranger
        .get_bytes(&format!("/media/{key}"), None, &[])
        .await;
    assert_eq!(status, 403, "anonymous access to a private file");

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
    for id in [user_id, stranger_id] {
        let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{id}"));
    }
}

#[tokio::test]
async fn public_profiles_serve_media_to_everyone() {
    let (client, email, cookie, user_id) = logged_in().await;
    let upload_id = upload(&client, &cookie).await;
    let key = format!("u/{user_id}/{upload_id}/large.webp");

    let updated = client
        .patch("/api/v1/me", json!({ "is_public": true }), &cookie)
        .await;
    assert_eq!(updated.status, 200);

    let (status, headers, _) = client.get_bytes(&format!("/media/{key}"), None, &[]).await;
    assert_eq!(status, 200);
    assert_eq!(headers["content-type"], "image/webp");

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

#[tokio::test]
async fn bad_keys_are_rejected() {
    let (client, email, cookie, user_id) = logged_in().await;

    for path in [
        "/media/u/../secret",
        "/media/not-a-key",
        "/media/u/not-a-uuid/00000000-0000-0000-0000-000000000000/large.webp",
    ] {
        let (status, _, _) = client.get_bytes(path, Some(&cookie), &[]).await;
        assert!(status == 400 || status == 404, "{path} returned {status}");
    }

    // A well-formed key that points at nothing.
    let missing = format!("/media/u/{user_id}/00000000-0000-0000-0000-000000000000/large.webp");
    let (status, _, _) = client.get_bytes(&missing, Some(&cookie), &[]).await;
    assert_eq!(status, 404);

    client.cleanup(&email).await;
}
