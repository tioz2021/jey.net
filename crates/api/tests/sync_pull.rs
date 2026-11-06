mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

async fn setup() -> (TestClient, String, Uuid) {
    let client = TestClient::new().await;
    let email = format!("sync-pull-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Pull" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");
    let device_id = Uuid::new_v4();
    let device = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Pull desktop", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(device.status, StatusCode::CREATED);
    (client, cookie, device_id)
}

async fn pull(
    client: &TestClient,
    cookie: &str,
    device_id: Uuid,
    since: i64,
    limit: i64,
) -> (StatusCode, Value) {
    let path = format!("/api/v1/sync/pull?since={since}&limit={limit}");
    let device = device_id.to_string();
    let (status, _, bytes) = client
        .get_bytes(
            &path,
            Some(cookie),
            &[("x-device-id", device.as_str()), ("x-sync-version", "1")],
        )
        .await;
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, body)
}

#[tokio::test]
async fn returns_ordered_pages_and_tombstones() {
    let (client, cookie, device_id) = setup().await;

    let first = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Pull first", "status": "done" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    let first_id = first.body["item"]["id"].as_str().unwrap().to_owned();
    let first_seq = first.body["item"]["sync_seq"].as_u64().unwrap() as i64;

    let second = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Pull second", "status": "planned" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::CREATED);
    let second_id = second.body["item"]["id"].as_str().unwrap().to_owned();
    let second_seq = second.body["item"]["sync_seq"].as_u64().unwrap() as i64;
    assert!(second_seq > first_seq);

    let (status, page) = pull(&client, &cookie, device_id, 0, 1).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["protocol_version"], 1);
    assert_eq!(page["changes"].as_array().unwrap().len(), 1);
    assert_eq!(page["changes"][0]["id"], first_id);
    assert_eq!(page["changes"][0]["payload"]["title"], "Pull first");
    assert_eq!(page["has_more"], true);
    assert_eq!(page["next_since"], first_seq);

    let (_, all) = pull(&client, &cookie, device_id, 0, 500).await;
    assert_eq!(all["changes"].as_array().unwrap().len(), 2);
    assert_eq!(all["has_more"], false);
    assert_eq!(all["next_since"], second_seq);

    let updated = client
        .patch(
            &format!("/api/v1/items/{first_id}"),
            json!({ "title": "Pull first edited" }),
            &cookie,
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);

    let deleted = client
        .delete(&format!("/api/v1/items/{second_id}"), json!({}), &cookie)
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);

    let (_, after) = pull(&client, &cookie, device_id, second_seq, 500).await;
    let changes = after["changes"].as_array().unwrap();
    assert_eq!(changes.len(), 2);
    let edited = changes
        .iter()
        .find(|change| change["id"] == first_id)
        .unwrap();
    assert_eq!(edited["payload"]["title"], "Pull first edited");
    let tombstone = changes
        .iter()
        .find(|change| change["id"] == second_id)
        .unwrap();
    assert!(tombstone["deleted_at"].is_string());
    assert!(tombstone["payload"].is_null());
}

#[tokio::test]
async fn rejects_unknown_device_and_bad_version() {
    let (client, cookie, device_id) = setup().await;
    let unknown = Uuid::new_v4().to_string();
    let (status, _) = pull(&client, &cookie, Uuid::parse_str(&unknown).unwrap(), 0, 1).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let path = "/api/v1/sync/pull?since=0&limit=1";
    let device = device_id.to_string();
    let (missing_version, _, _) = client
        .get_bytes(path, Some(&cookie), &[("x-device-id", device.as_str())])
        .await;
    assert_eq!(missing_version, StatusCode::BAD_REQUEST);

    let (bad_version, _, _) = client
        .get_bytes(
            path,
            Some(&cookie),
            &[("x-device-id", device.as_str()), ("x-sync-version", "2")],
        )
        .await;
    assert_eq!(bad_version, StatusCode::BAD_REQUEST);
}
