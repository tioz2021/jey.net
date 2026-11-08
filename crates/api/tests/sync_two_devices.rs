//! Two-device item sync: create, edit, tombstone, no duplicates.

mod common;

use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

struct Device {
    cookie: String,
    id: Uuid,
}

async fn register_user(client: &TestClient) -> String {
    let email = format!("two-{}@example.test", Uuid::new_v4());
    let response = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": "correct horse battery", "display_name": "Two devices" }),
        )
        .await;
    assert_eq!(response.status, StatusCode::CREATED, "{}", response.body);
    response.session_cookie().expect("session cookie")
}

async fn register_device(client: &TestClient, cookie: &str, name: &str) -> Device {
    let id = Uuid::new_v4();
    let response = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": id, "name": name, "platform": "linux" }),
            cookie,
        )
        .await;
    assert_eq!(response.status, StatusCode::CREATED, "{}", response.body);
    Device {
        cookie: cookie.to_owned(),
        id,
    }
}

fn headers(device: &Device) -> Vec<(&'static str, String)> {
    vec![
        ("x-device-id", device.id.to_string()),
        ("x-sync-version", "1".to_owned()),
    ]
}

fn refs<'a>(values: &'a [(&'static str, String)]) -> Vec<(&'static str, &'a str)> {
    values
        .iter()
        .map(|(key, value)| (*key, value.as_str()))
        .collect()
}

async fn push(
    client: &TestClient,
    device: &Device,
    id: Uuid,
    revision: i64,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    title: &str,
) -> Value {
    let payload = if deleted_at.is_some() {
        Value::Null
    } else {
        json!({ "kind": "movie", "title": title, "status": "done", "rating": 8 })
    };
    let response = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": Uuid::new_v4(),
                "changes": [{
                    "entity": "item", "id": id, "revision": revision,
                    "updated_at": updated_at, "deleted_at": deleted_at, "payload": payload
                }]
            }),
            &device.cookie,
            &refs(&headers(device)),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK, "{}", response.body);
    response.body
}

async fn pull(client: &TestClient, device: &Device, since: i64) -> Value {
    let (status, _, bytes) = client
        .get_bytes(
            &format!("/api/v1/sync/pull?since={since}&limit=500"),
            Some(&device.cookie),
            &refs(&headers(device)),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&bytes).expect("pull JSON")
}

#[tokio::test]
async fn two_devices_see_create_edit_and_delete_once() {
    let client = TestClient::new().await;
    let cookie = register_user(&client).await;
    let a = register_device(&client, &cookie, "device-a").await;
    let b = register_device(&client, &cookie, "device-b").await;
    let id = Uuid::new_v4();
    let now = Utc::now();

    push(&client, &a, id, 1, now, None, "Created on A").await;

    let published = pull(&client, &b, 0).await;
    assert_eq!(published["changes"].as_array().unwrap().len(), 1);
    assert_eq!(published["changes"][0]["payload"]["title"], "Created on A");
    let seq_after_create = published["next_since"].as_i64().unwrap();

    push(
        &client,
        &b,
        id,
        2,
        now + chrono::Duration::seconds(1),
        None,
        "Edited on B",
    )
    .await;

    let edited = pull(&client, &a, seq_after_create).await;
    assert_eq!(edited["changes"].as_array().unwrap().len(), 1);
    assert_eq!(edited["changes"][0]["payload"]["title"], "Edited on B");
    let seq_after_edit = edited["next_since"].as_i64().unwrap();

    push(
        &client,
        &a,
        id,
        3,
        now + chrono::Duration::seconds(2),
        Some(now + chrono::Duration::seconds(2)),
        "",
    )
    .await;

    let deleted = pull(&client, &b, seq_after_edit).await;
    assert_eq!(deleted["changes"].as_array().unwrap().len(), 1);
    assert!(deleted["changes"][0]["deleted_at"].is_string());
    assert!(deleted["changes"][0]["payload"].is_null());

    let nothing_new = pull(&client, &a, deleted["next_since"].as_i64().unwrap()).await;
    assert_eq!(nothing_new["changes"].as_array().unwrap().len(), 0);
}
