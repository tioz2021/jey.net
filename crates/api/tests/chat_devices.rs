//! T150.2: public device keys are registered, discoverable and revocable.

mod common;

use base64::Engine;
use common::{TestClient, unique_email};
use serde_json::json;
use uuid::Uuid;

const PASSWORD: &str = "correct horse battery";

async fn account(name: &str) -> (TestClient, String, String, Uuid) {
    let client = TestClient::new().await;
    let email = unique_email();
    let response = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": name }),
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);
    let cookie = response.session_cookie().expect("cookie");
    let id = response.body["user"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    (client, email, cookie, id)
}

fn key(fill: u8) -> String {
    base64::engine::general_purpose::STANDARD.encode([fill; 32])
}

async fn register(
    client: &TestClient,
    cookie: &str,
    device: Uuid,
    public_key: String,
) -> common::TestResponse {
    client
        .post_with_cookie(
            "/api/v1/chat/devices",
            json!({ "device_id": device, "public_key": public_key, "name": "Test device" }),
            cookie,
        )
        .await
}

#[tokio::test]
async fn registers_rotates_and_revokes_device_keys() {
    let (alice, alice_email, alice_cookie, alice_id) = account("Device Alice").await;
    let (bob, bob_email, bob_cookie, _) = account("Device Bob").await;
    let device = Uuid::new_v4();

    let invalid = register(&alice, &alice_cookie, device, "not-base64".to_owned()).await;
    assert_eq!(invalid.status, 400, "body: {}", invalid.body);

    let created = register(&alice, &alice_cookie, device, key(1)).await;
    assert_eq!(created.status, 200, "body: {}", created.body);
    assert_eq!(created.body["registered"], true);

    let own = alice.get("/api/v1/chat/devices", Some(&alice_cookie)).await;
    assert_eq!(own.status, 200, "body: {}", own.body);
    assert_eq!(own.body["devices"].as_array().unwrap().len(), 1);
    assert_eq!(own.body["devices"][0]["device_id"], device.to_string());

    let acked = bob
        .get(
            &format!("/api/v1/chat/users/{alice_id}/devices"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(acked.status, 200, "body: {}", acked.body);
    assert_eq!(acked.body["devices"][0]["public_key"], key(1));
    assert_eq!(acked.body["devices"][0]["algorithm"], "x25519");

    let rotated = register(&alice, &alice_cookie, device, key(2)).await;
    assert_eq!(rotated.status, 200, "body: {}", rotated.body);
    let own = alice.get("/api/v1/chat/devices", Some(&alice_cookie)).await;
    assert_eq!(own.body["devices"].as_array().unwrap().len(), 1);
    assert_eq!(own.body["devices"][0]["public_key"], key(2));

    let revoked = alice
        .delete(
            &format!("/api/v1/chat/devices/{device}"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(revoked.status, 200, "body: {}", revoked.body);
    let own = alice.get("/api/v1/chat/devices", Some(&alice_cookie)).await;
    assert!(own.body["devices"].as_array().unwrap().is_empty());
    let after_revoke = bob
        .get(
            &format!("/api/v1/chat/users/{alice_id}/devices"),
            Some(&bob_cookie),
        )
        .await;
    assert!(after_revoke.body["devices"].as_array().unwrap().is_empty());

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}
