mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

async fn setup() -> (TestClient, String, Uuid) {
    let client = TestClient::new().await;
    let email = format!("sync-status-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Status" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");
    let device_id = Uuid::new_v4();
    let device = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Status desktop", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(device.status, StatusCode::CREATED);
    (client, cookie, device_id)
}

async fn status(
    client: &TestClient,
    cookie: &str,
    device_id: Uuid,
    since: i64,
) -> (StatusCode, Value) {
    let path = format!("/api/v1/sync/status?since={since}");
    let device = device_id.to_string();
    let (status, _, bytes) = client
        .get_bytes(
            &path,
            Some(cookie),
            &[("x-device-id", device.as_str()), ("x-sync-version", "1")],
        )
        .await;
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn counts_changes_after_since() {
    let (client, cookie, device_id) = setup().await;

    let (empty, body) = status(&client, &cookie, device_id, 0).await;
    assert_eq!(empty, StatusCode::OK);
    assert_eq!(body["changes_after"], 0);
    assert!(body["server_time"].is_string());

    let first = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Status first", "status": "done" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    let first_seq = first.body["item"]["sync_seq"].as_u64().unwrap() as i64;

    let second = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Status second", "status": "planned" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::CREATED);
    let second_seq = second.body["item"]["sync_seq"].as_u64().unwrap() as i64;

    let (_, all) = status(&client, &cookie, device_id, 0).await;
    assert_eq!(all["changes_after"], 2);
    assert_eq!(all["last_seq"], second_seq);

    let (_, after_first) = status(&client, &cookie, device_id, first_seq).await;
    assert_eq!(after_first["changes_after"], 1);

    let (_, idle) = status(&client, &cookie, device_id, second_seq).await;
    assert_eq!(idle["changes_after"], 0);
    assert_eq!(idle["last_seq"], second_seq);
}

#[tokio::test]
async fn rejects_unknown_device_and_bad_version() {
    let (client, cookie, device_id) = setup().await;
    let unknown = Uuid::new_v4().to_string();
    let (bad_device, _) = status(&client, &cookie, Uuid::parse_str(&unknown).unwrap(), 0).await;
    assert_eq!(bad_device, StatusCode::BAD_REQUEST);

    let device = device_id.to_string();
    let (missing_version, _, _) = client
        .get_bytes(
            "/api/v1/sync/status?since=0",
            Some(&cookie),
            &[("x-device-id", device.as_str())],
        )
        .await;
    assert_eq!(missing_version, StatusCode::BAD_REQUEST);
}
