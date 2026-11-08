mod common;

use axum::http::StatusCode;
use chrono::{Duration, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

async fn setup() -> (TestClient, String, Uuid) {
    let client = TestClient::new().await;
    let email = format!("sync-conflict-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Conflicts" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");
    let device_id = Uuid::new_v4();
    let device = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Conflict desktop", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(device.status, StatusCode::CREATED);
    (client, cookie, device_id)
}

fn sync_headers(device_id: Uuid) -> Vec<(&'static str, String)> {
    vec![
        ("x-device-id", device_id.to_string()),
        ("x-sync-version", "1".to_owned()),
    ]
}

fn refs<'a>(values: &'a [(&'static str, String)]) -> Vec<(&'static str, &'a str)> {
    values
        .iter()
        .map(|(key, value)| (*key, value.as_str()))
        .collect()
}

async fn push_change(
    client: &TestClient,
    cookie: &str,
    device_id: Uuid,
    id: Uuid,
    revision: i64,
    title: &str,
    when: chrono::DateTime<Utc>,
) -> Value {
    client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": Uuid::new_v4(),
                "changes": [{
                    "entity": "item", "id": id, "revision": revision,
                    "updated_at": when, "deleted_at": null,
                    "payload": { "kind": "movie", "title": title, "status": "done" }
                }]
            }),
            cookie,
            &refs(&sync_headers(device_id)),
        )
        .await
        .body
}

async fn conflicts(client: &TestClient, cookie: &str, device_id: Uuid) -> Value {
    let device = device_id.to_string();
    let (status, _, bytes) = client
        .get_bytes(
            "/api/v1/sync/conflicts",
            Some(cookie),
            &[("x-device-id", device.as_str()), ("x-sync-version", "1")],
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&bytes).expect("conflicts JSON")
}

async fn resolve(
    client: &TestClient,
    cookie: &str,
    device_id: Uuid,
    conflict_id: &str,
    keep: &str,
) -> (StatusCode, Value) {
    let device = device_id.to_string();
    let response = client
        .post_with_headers(
            &format!("/api/v1/sync/conflicts/{conflict_id}/resolve"),
            json!({ "keep": keep }),
            cookie,
            &[("x-device-id", device.as_str()), ("x-sync-version", "1")],
        )
        .await;
    (response.status, response.body)
}

#[tokio::test]
async fn lists_and_resolves_both_sides() {
    let (client, cookie, device_id) = setup().await;
    let now = Utc::now();
    let first_id = Uuid::new_v4();

    let _ = push_change(
        &client,
        &cookie,
        device_id,
        first_id,
        2,
        "Stored title",
        now,
    )
    .await;
    let stale = push_change(
        &client,
        &cookie,
        device_id,
        first_id,
        1,
        "Incoming title",
        now - Duration::hours(1),
    )
    .await;
    assert_eq!(stale["conflicts"].as_array().unwrap().len(), 1);

    let open = conflicts(&client, &cookie, device_id).await;
    assert_eq!(open["conflicts"].as_array().unwrap().len(), 1);
    let conflict_id = open["conflicts"][0]["conflict_id"]
        .as_str()
        .unwrap()
        .to_owned();

    let (status, item) = resolve(&client, &cookie, device_id, &conflict_id, "incoming").await;
    assert_eq!(status, StatusCode::OK, "{item}");
    assert_eq!(item["title"], "Incoming title");
    assert_eq!(item["revision"], 3);
    assert!(item["sync_seq"].as_u64().unwrap() > 0);
    assert_eq!(
        conflicts(&client, &cookie, device_id).await["conflicts"]
            .as_array()
            .unwrap()
            .len(),
        0
    );

    let second_id = Uuid::new_v4();
    let _ = push_change(
        &client,
        &cookie,
        device_id,
        second_id,
        2,
        "Keep stored",
        now + Duration::seconds(1),
    )
    .await;
    let _ = push_change(
        &client,
        &cookie,
        device_id,
        second_id,
        1,
        "Rejected",
        now - Duration::hours(1),
    )
    .await;
    let open = conflicts(&client, &cookie, device_id).await;
    let conflict_id = open["conflicts"][0]["conflict_id"]
        .as_str()
        .unwrap()
        .to_owned();

    let (status, item) = resolve(&client, &cookie, device_id, &conflict_id, "stored").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(item["title"], "Keep stored");
    assert_eq!(item["revision"], 3);
}

#[tokio::test]
async fn rejects_bad_choice_and_unknown_conflict() {
    let (client, cookie, device_id) = setup().await;
    let device = device_id.to_string();
    let conflict_id = Uuid::new_v4().to_string();
    let (status, _) = resolve(&client, &cookie, device_id, &conflict_id, "neither").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = resolve(&client, &cookie, device_id, &conflict_id, "incoming").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let _ = device;
}

#[tokio::test]
async fn newer_same_revision_keeps_the_losing_version_as_conflict() {
    let (client, cookie, device_id) = setup().await;
    let now = Utc::now();
    let id = Uuid::new_v4();

    let _ = push_change(&client, &cookie, device_id, id, 1, "Stored version", now).await;
    let incoming = push_change(
        &client,
        &cookie,
        device_id,
        id,
        1,
        "Newer version",
        now + Duration::seconds(1),
    )
    .await;
    assert_eq!(incoming["conflicts"].as_array().unwrap().len(), 1);

    let open = conflicts(&client, &cookie, device_id).await;
    assert_eq!(open["conflicts"].as_array().unwrap().len(), 1);
    let conflict = &open["conflicts"][0];
    assert_eq!(conflict["incoming"]["payload"]["title"], "Newer version");
    assert_eq!(conflict["stored"]["title"], "Stored version");
    let conflict_id = conflict["conflict_id"].as_str().unwrap();

    let (status, item) = resolve(&client, &cookie, device_id, conflict_id, "stored").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(item["title"], "Stored version");
}
