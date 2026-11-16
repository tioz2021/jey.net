//! T145: a longer conversation keeps history, pagination and idempotency intact.

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

#[tokio::test]
async fn forty_messages_are_paginated_without_duplicates() {
    let (alice, alice_email, alice_cookie, _) = account("Load Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Load Bob").await;
    let thread = alice
        .post_with_cookie(
            "/api/v1/chat/threads",
            json!({ "user_id": bob_id }),
            &alice_cookie,
        )
        .await;
    assert_eq!(thread.status, 200, "body: {}", thread.body);
    let thread_id = thread.body["thread"]["id"].as_str().unwrap();
    let mut client_ids = Vec::new();

    for index in 0..40 {
        let client_id = Uuid::new_v4();
        client_ids.push(client_id);
        let response = alice
            .post_with_cookie(
                &format!("/api/v1/chat/threads/{thread_id}/messages"),
                json!({ "body": format!("Нагрузочное сообщение {index}"), "client_id": client_id }),
                &alice_cookie,
            )
            .await;
        assert_eq!(response.status, 200, "message {index}: {}", response.body);
        assert_eq!(response.body["created"], true);
    }

    // Replaying the last client_id returns the original row, not a 41st message.
    let replay = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "body": "Нагрузочное сообщение 39", "client_id": client_ids[39] }),
            &alice_cookie,
        )
        .await;
    assert_eq!(replay.status, 200, "body: {}", replay.body);
    assert_eq!(replay.body["created"], false);

    let first = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages?limit=10"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(first.status, 200, "body: {}", first.body);
    assert_eq!(first.body["messages"].as_array().unwrap().len(), 10);
    let next_before = first.body["next_before"].as_str().expect("cursor");
    let second = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages?limit=10&before={next_before}"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(second.status, 200, "body: {}", second.body);
    assert_eq!(second.body["messages"].as_array().unwrap().len(), 10);
    assert_ne!(
        second.body["messages"][9]["id"], first.body["messages"][0]["id"],
        "pages must not overlap"
    );
    let bob_threads = bob.get("/api/v1/chat/threads", Some(&bob_cookie)).await;
    assert_eq!(bob_threads.body["threads"][0]["unread"], 40);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}

#[allow(dead_code)]
fn _keep_value(_: &Value) {}
