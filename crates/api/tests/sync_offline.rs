mod common;

use axum::http::StatusCode;
use chrono::{DateTime, Duration, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

struct Device {
    cookie: String,
    id: Uuid,
}

async fn register(client: &TestClient, email: &str) -> String {
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": "correct horse battery", "display_name": "Offline" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    registered.session_cookie().expect("session cookie")
}

async fn login(client: &TestClient, email: &str) -> String {
    let logged = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": "correct horse battery" }),
        )
        .await;
    assert_eq!(logged.status, StatusCode::OK);
    logged.session_cookie().expect("session cookie")
}

async fn device(client: &TestClient, cookie: &str, name: &str) -> Device {
    let id = Uuid::new_v4();
    let response = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": id, "name": name, "platform": "linux" }),
            cookie,
        )
        .await;
    assert_eq!(response.status, StatusCode::CREATED);
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

#[allow(clippy::too_many_arguments)]
async fn push(
    client: &TestClient,
    device: &Device,
    batch_id: Uuid,
    id: Uuid,
    revision: i64,
    when: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    title: &str,
) -> Value {
    let payload = if deleted_at.is_some() {
        Value::Null
    } else {
        json!({ "kind": "movie", "title": title, "status": "done" })
    };
    let response = client
        .post_with_headers(
            "/api/v1/sync/push",
            json!({
                "batch_id": batch_id,
                "changes": [{
                    "entity": "item", "id": id, "revision": revision,
                    "updated_at": when, "deleted_at": deleted_at, "payload": payload
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
    let path = format!("/api/v1/sync/pull?since={since}&limit=500");
    let (status, _, bytes) = client
        .get_bytes(&path, Some(&device.cookie), &refs(&headers(device)))
        .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&bytes).expect("pull JSON")
}

async fn open_conflicts(client: &TestClient, device: &Device) -> Value {
    let (status, _, bytes) = client
        .get_bytes(
            "/api/v1/sync/conflicts",
            Some(&device.cookie),
            &refs(&headers(device)),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&bytes).expect("conflicts JSON")
}

#[tokio::test]
async fn two_offline_devices_conflict_and_resolve() {
    let client = TestClient::new().await;
    let email = format!("offline-{}@example.com", Uuid::new_v4());
    let first_cookie = register(&client, &email).await;
    let first = device(&client, &first_cookie, "First").await;
    let second = device(&client, &login(&client, &email).await, "Second").await;
    let item_id = Uuid::new_v4();
    let base_time = Utc::now();

    let create_batch = Uuid::new_v4();
    let created = push(
        &client,
        &first,
        create_batch,
        item_id,
        1,
        base_time,
        None,
        "Offline base",
    )
    .await;
    let base_seq = created["applied"][0]["sync_seq"].as_u64().unwrap() as i64;

    let second_view = pull(&client, &second, 0).await;
    assert_eq!(second_view["changes"].as_array().unwrap().len(), 1);

    // Both edited from revision 1 while offline. The first device's edit is
    // later; the second device's edit must become a conflict copy.
    let first_edit = push(
        &client,
        &first,
        Uuid::new_v4(),
        item_id,
        2,
        base_time + Duration::minutes(2),
        None,
        "Later from first",
    )
    .await;
    let second_edit = push(
        &client,
        &second,
        Uuid::new_v4(),
        item_id,
        2,
        base_time + Duration::minutes(1),
        None,
        "Earlier from second",
    )
    .await;
    assert_eq!(first_edit["conflicts"].as_array().unwrap().len(), 0);
    assert_eq!(second_edit["conflicts"].as_array().unwrap().len(), 1);

    let conflicts = open_conflicts(&client, &second).await;
    let conflict_id = conflicts["conflicts"][0]["conflict_id"].as_str().unwrap();
    let resolved = client
        .post_with_headers(
            &format!("/api/v1/sync/conflicts/{conflict_id}/resolve"),
            json!({ "keep": "incoming" }),
            &second.cookie,
            &refs(&headers(&second)),
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK);
    assert_eq!(resolved.body["title"], "Earlier from second");
    assert_eq!(resolved.body["revision"], 3);

    let first_catch_up = pull(&client, &first, base_seq).await;
    let latest = first_catch_up["changes"]
        .as_array()
        .unwrap()
        .last()
        .unwrap();
    assert_eq!(latest["payload"]["title"], "Earlier from second");

    let retry = push(
        &client,
        &first,
        create_batch,
        item_id,
        1,
        base_time,
        None,
        "Offline base",
    )
    .await;
    assert_eq!(
        retry["applied"].as_array().unwrap().len(),
        1,
        "the retried create batch is ignored because the batch id is known"
    );
}

#[tokio::test]
async fn deletion_beats_older_edit_and_a_third_device_gets_the_truth() {
    let client = TestClient::new().await;
    let email = format!("delete-edit-{}@example.com", Uuid::new_v4());
    let first = device(&client, &register(&client, &email).await, "First").await;
    let second = device(&client, &login(&client, &email).await, "Second").await;
    let third = device(&client, &login(&client, &email).await, "Third").await;
    let item_id = Uuid::new_v4();
    let base = Utc::now();

    let created = push(
        &client,
        &first,
        Uuid::new_v4(),
        item_id,
        1,
        base,
        None,
        "Delete me",
    )
    .await;
    let base_seq = created["applied"][0]["sync_seq"].as_u64().unwrap() as i64;

    let tombstone = push(
        &client,
        &first,
        Uuid::new_v4(),
        item_id,
        2,
        base + Duration::minutes(2),
        Some(base + Duration::minutes(10)),
        "",
    )
    .await;
    assert_eq!(tombstone["applied"].as_array().unwrap().len(), 1);

    let old_edit = push(
        &client,
        &second,
        Uuid::new_v4(),
        item_id,
        2,
        base + Duration::minutes(1),
        None,
        "Old edit",
    )
    .await;
    assert_eq!(old_edit["conflicts"].as_array().unwrap().len(), 1);

    let conflicts = open_conflicts(&client, &second).await;
    let conflict_id = conflicts["conflicts"][0]["conflict_id"].as_str().unwrap();
    let resolved = client
        .post_with_headers(
            &format!("/api/v1/sync/conflicts/{conflict_id}/resolve"),
            json!({ "keep": "stored" }),
            &second.cookie,
            &refs(&headers(&second)),
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK, "{}", resolved.body);
    assert!(resolved.body["deleted_at"].is_string());

    let fresh = pull(&client, &third, 0).await;
    let final_item = fresh["changes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|change| change["id"] == item_id.to_string())
        .unwrap();
    assert!(final_item["deleted_at"].is_string());
    assert!(final_item["payload"].is_null());

    // Status and pull agree for the same cursor.
    let (status, _, status_bytes) = client
        .get_bytes(
            &format!("/api/v1/sync/status?since={base_seq}"),
            Some(&third.cookie),
            &refs(&headers(&third)),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let status_body: Value = serde_json::from_slice(&status_bytes).unwrap();
    let after_cursor = pull(&client, &third, base_seq).await;
    assert_eq!(
        status_body["changes_after"],
        after_cursor["changes"].as_array().unwrap().len() as i64
    );
}
