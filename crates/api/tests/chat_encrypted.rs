//! T150.4: server stores opaque E2E envelopes and never requires plaintext.

mod common;

use common::{TestClient, unique_email};
use serde_json::{Value, json};
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

fn envelope(device: Uuid, ciphertext: &str) -> Value {
    json!({
        "version": 1,
        "envelopes": [{
            "device_id": device,
            "version": 1,
            "ephemeral_public": "ZXBoZW1lcmFs",
            "salt": "c2FsdA==",
            "nonce": "bm9uY2U=",
            "ciphertext": ciphertext,
        }]
    })
}

#[tokio::test]
async fn sends_edits_and_history_keep_ciphertext_opaque() {
    let (alice, alice_email, alice_cookie, _) = account("E2E Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("E2E Bob").await;
    let thread = alice
        .post_with_cookie(
            "/api/v1/chat/threads",
            json!({ "user_id": bob_id }),
            &alice_cookie,
        )
        .await;
    let thread_id = thread.body["thread"]["id"].as_str().unwrap();
    let client_id = Uuid::new_v4();
    let device = Uuid::new_v4();
    let encrypted = envelope(device, "Y2lwaGVydGV4dA==");

    let sent = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "client_id": client_id, "encrypted": encrypted }),
            &alice_cookie,
        )
        .await;
    assert_eq!(sent.status, 200, "body: {}", sent.body);
    assert_eq!(sent.body["message"]["body"], "[encrypted]");
    assert_eq!(sent.body["message"]["encryption_version"], 1);
    assert_eq!(
        sent.body["message"]["encrypted"]["envelopes"][0]["ciphertext"],
        "Y2lwaGVydGV4dA=="
    );
    let message_id = sent.body["message"]["id"].as_str().unwrap();

    let replayed = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "client_id": client_id, "encrypted": encrypted }),
            &alice_cookie,
        )
        .await;
    assert_eq!(replayed.status, 200, "body: {}", replayed.body);
    assert_eq!(replayed.body["created"], false);

    let edited = alice
        .patch(
            &format!("/api/v1/chat/threads/{thread_id}/messages/{message_id}"),
            json!({ "encrypted": envelope(device, "bmV3LWNpcGhlcg==") }),
            &alice_cookie,
        )
        .await;
    assert_eq!(edited.status, 200, "body: {}", edited.body);
    assert_eq!(
        edited.body["message"]["encrypted"]["envelopes"][0]["ciphertext"],
        "bmV3LWNpcGhlcg=="
    );

    let history = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(history.status, 200, "body: {}", history.body);
    assert_eq!(history.body["messages"][0]["body"], "[encrypted]");
    assert_eq!(history.body["messages"][0]["encrypted"]["version"], 1);
    assert!(history.body["messages"][0]["edited_at"].is_string());

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}
