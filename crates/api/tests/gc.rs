//! Garbage collection: orphaned uploads go, referenced and fresh files stay.

mod common;

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use common::{TestClient, pool, unique_email};
use image::{DynamicImage, ImageFormat};
use jey_api::media::{LocalStorage, gc};
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

async fn logged_in() -> (TestClient, String, String, uuid::Uuid) {
    let client = TestClient::new().await;
    let email = unique_email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "GC" }),
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

async fn upload(client: &TestClient, cookie: &str) -> uuid::Uuid {
    let response = client
        .post_multipart_with_cookie("/api/v1/uploads", "photo.png", "image/png", &png(), cookie)
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);

    response.body["upload"]["id"]
        .as_str()
        .expect("upload id")
        .parse()
        .expect("uuid")
}

async fn keys_of(pool: &sqlx::PgPool, upload_id: uuid::Uuid) -> [String; 3] {
    let (storage_key, large_key, preview_key) = sqlx::query_as::<_, (String, String, String)>(
        "select storage_key, large_key, preview_key from uploads where id = $1",
    )
    .bind(upload_id)
    .fetch_one(pool)
    .await
    .expect("upload keys");

    [storage_key, large_key, preview_key]
}

fn path_of(key: &str) -> PathBuf {
    Path::new(MEDIA_DIR).join(key)
}

fn make_old(path: &Path) {
    let file = std::fs::OpenOptions::new()
        .write(true)
        .open(path)
        .expect("open for mtime");
    let old = SystemTime::now() - Duration::from_secs(25 * 60 * 60);
    file.set_modified(old).expect("set mtime");
}

#[tokio::test]
async fn removes_orphans_and_keeps_referenced_and_fresh_files() {
    // The test owns this directory; stale files from an earlier run must not
    // change the expected deletion count.
    let _ = std::fs::remove_dir_all(MEDIA_DIR);
    let (client, email, cookie, user_id) = logged_in().await;
    let pool = pool().await;
    let storage = LocalStorage::new(MEDIA_DIR);

    // Covered upload: kept even when old.
    let cover_upload = upload(&client, &cookie).await;
    let cover_keys = keys_of(&pool, cover_upload).await;
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
            json!({ "upload_id": cover_upload }),
            &cookie,
        )
        .await;
    mark_old(&pool, cover_upload).await;

    // Orphaned upload: old and never referenced.
    let orphan = upload(&client, &cookie).await;
    let orphan_keys = keys_of(&pool, orphan).await;
    mark_old(&pool, orphan).await;

    // Fresh upload: too young to collect.
    let fresh = upload(&client, &cookie).await;
    let fresh_keys = keys_of(&pool, fresh).await;

    // A stray file that belongs to no upload row.
    let stray_dir = path_of(&format!("u/{user_id}/stray"));
    std::fs::create_dir_all(&stray_dir).expect("stray dir");
    let stray = stray_dir.join("old.webp");
    std::fs::write(&stray, b"orphan").expect("stray file");
    make_old(&stray);

    let report = gc::run(&pool, &storage, Path::new(MEDIA_DIR))
        .await
        .expect("gc runs");

    assert!(cover_keys.iter().all(|key| path_of(key).exists()));
    assert!(orphan_keys.iter().all(|key| !path_of(key).exists()));
    assert!(fresh_keys.iter().all(|key| path_of(key).exists()));
    assert!(!stray.exists(), "stray file is removed");

    assert_eq!(report.uploads_deleted, 1, "only the orphan upload");
    assert_eq!(report.files_deleted, 4, "three orphan files and the stray");

    let row: i64 = sqlx::query_scalar("select count(*) from uploads where id = $1")
        .bind(orphan)
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(row, 0);

    // Idempotent: the second pass finds nothing.
    let second = gc::run(&pool, &storage, Path::new(MEDIA_DIR))
        .await
        .expect("gc runs again");
    assert_eq!(second, gc::Report::default());

    client.cleanup(&email).await;
    let _ = std::fs::remove_dir_all(format!("{MEDIA_DIR}/u/{user_id}"));
}

async fn mark_old(pool: &sqlx::PgPool, upload_id: uuid::Uuid) {
    sqlx::query("update uploads set created_at = now() - interval '25 hours' where id = $1")
        .bind(upload_id)
        .execute(pool)
        .await
        .expect("make upload old");
}
