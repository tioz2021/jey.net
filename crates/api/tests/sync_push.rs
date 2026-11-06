mod common;

use axum::http::StatusCode;
use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;

use common::TestClient;

async fn setup() -> (TestClient, String, Uuid) {
    let client = TestClient::new().await;
    let email = format!("sync-push-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Push" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");
    let device_id = Uuid::new_v4();
    let device = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Test desktop", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(device.status, StatusCode::CREATED);
    (client, cookie, device_id)
}

fn headers(device_id: Uuid) -> Vec<(&'static str, String)> {
    vec![
        ("x-device-id", device_id.to_string()),
        ("x-sync-version", "1".to_owned()),
    ]
}

fn as_refs<'a>(values: &'a [(&'static str, String)]) -> Vec<(&'static str, &'a str)> {
    values
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect()
}

#[tokio::test]
async fn applies_creates_updates_retries_and_conflicts() {
    let (client, cookie, device_id) = setup().await;
    let item_id = Uuid::new_v4();
    let batch_id = Uuid::new_v4();
    let now = Utc::now();

    let create = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": batch_id,
                "changes": [{
                    "entity": "item",
                    "id": item_id,
                    "revision": 1,
                    "updated_at": now,
                    "deleted_at": null,
                    "payload": { "kind": "movie", "title": "Push movie", "status": "done", "rating": 8 }
                }]
            }),
            &cookie,
            &as_refs(&headers(device_id)),
        )
        .await;
    assert_eq!(create.status, StatusCode::OK, "{}", create.body);
    assert_eq!(create.body["protocol_version"], 1);
    assert_eq!(create.body["applied"].as_array().unwrap().len(), 1);
    let first_seq = create.body["applied"][0]["sync_seq"].as_u64().unwrap();

    let retry = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": batch_id,
                "changes": [{
                    "entity": "item", "id": item_id, "revision": 1,
                    "updated_at": now, "deleted_at": null,
                    "payload": { "kind": "movie", "title": "Push movie", "status": "done", "rating": 8 }
                }]
            }),
            &cookie,
            &as_refs(&headers(device_id)),
        )
        .await;
    assert_eq!(retry.status, StatusCode::OK);
    assert_eq!(retry.body, create.body);

    let update = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": Uuid::new_v4(),
                "changes": [{
                    "entity": "item", "id": item_id, "revision": 2,
                    "updated_at": now + Duration::seconds(1), "deleted_at": null,
                    "payload": { "kind": "movie", "title": "Push movie edited", "status": "done", "rating": 9 }
                }]
            }),
            &cookie,
            &as_refs(&headers(device_id)),
        )
        .await;
    assert_eq!(update.status, StatusCode::OK);
    let second_seq = update.body["applied"][0]["sync_seq"].as_u64().unwrap();
    assert!(second_seq > first_seq);

    let stale = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": Uuid::new_v4(),
                "changes": [{
                    "entity": "item", "id": item_id, "revision": 1,
                    "updated_at": now - Duration::hours(1), "deleted_at": null,
                    "payload": { "kind": "movie", "title": "Old version", "status": "done" }
                }]
            }),
            &cookie,
            &as_refs(&headers(device_id)),
        )
        .await;
    assert_eq!(stale.status, StatusCode::OK);
    assert_eq!(stale.body["conflicts"].as_array().unwrap().len(), 1);

    let deleted_at = now + Duration::seconds(2);
    let tombstone = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": Uuid::new_v4(),
                "changes": [{
                    "entity": "item", "id": item_id, "revision": 3,
                    "updated_at": deleted_at, "deleted_at": deleted_at, "payload": null
                }]
            }),
            &cookie,
            &as_refs(&headers(device_id)),
        )
        .await;
    assert_eq!(tombstone.status, StatusCode::OK);
    assert_eq!(tombstone.body["applied"].as_array().unwrap().len(), 1);

    let row: (String, bool) =
        sqlx::query_as("select title, deleted_at is not null from items where id = $1")
            .bind(item_id)
            .fetch_one(client.pool())
            .await
            .expect("persisted item");
    assert_eq!(row.0, "Push movie edited");
    assert!(row.1);
}

#[tokio::test]
async fn rejects_unknown_device_and_missing_version() {
    let (client, cookie, _device_id) = setup().await;
    let body = json!({ "batch_id": Uuid::new_v4(), "changes": [] });

    let unknown_device = Uuid::new_v4().to_string();
    let unknown = client
        .post_with_headers(
            "/api/v1/sync/push",
            body.clone(),
            &cookie,
            &[("x-device-id", unknown_device.as_str())],
        )
        .await;
    assert_eq!(unknown.status, StatusCode::BAD_REQUEST);

    let missing_version = client
        .post_with_headers(
            "/api/v1/sync/push",
            body,
            &cookie,
            &[("x-device-id", unknown_device.as_str())],
        )
        .await;
    assert_eq!(missing_version.status, StatusCode::BAD_REQUEST);
}
