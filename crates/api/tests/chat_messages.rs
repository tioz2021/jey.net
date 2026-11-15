//! T136: message history, idempotent send, read receipts and boundaries.

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
    let cookie = response.session_cookie().expect("session cookie");
    let id = response.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("uuid");
    (client, email, cookie, id)
}

async fn thread(client: &TestClient, cookie: &str, peer: Uuid) -> Uuid {
    let response = client
        .post_with_cookie("/api/v1/chat/threads", json!({ "user_id": peer }), cookie)
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    response.body["thread"]["id"]
        .as_str()
        .expect("thread id")
        .parse()
        .expect("uuid")
}

async fn send(
    client: &TestClient,
    cookie: &str,
    thread_id: Uuid,
    body: &str,
    client_id: Uuid,
) -> common::TestResponse {
    client
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "body": body, "client_id": client_id }),
            cookie,
        )
        .await
}

#[tokio::test]
async fn messages_are_idempotent_paginated_and_readable_only_by_members() {
    let (alice, alice_email, alice_cookie, _alice_id) = account("Message Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Message Bob").await;
    let (carol, carol_email, carol_cookie, _carol_id) = account("Message Carol").await;
    let thread_id = thread(&alice, &alice_cookie, bob_id).await;

    let first_client = Uuid::new_v4();
    let first = send(&alice, &alice_cookie, thread_id, "hello Bob", first_client).await;
    assert_eq!(first.status, 200, "body: {}", first.body);
    assert_eq!(first.body["created"], true);
    let first_id = first.body["message"]["id"]
        .as_str()
        .expect("message id")
        .to_owned();
    assert_eq!(first.body["message"]["body"], "hello Bob");

    let retry = send(&alice, &alice_cookie, thread_id, "hello Bob", first_client).await;
    assert_eq!(retry.status, 200, "body: {}", retry.body);
    assert_eq!(retry.body["created"], false);
    assert_eq!(retry.body["message"]["id"], first_id);

    let conflicting_retry = send(&alice, &alice_cookie, thread_id, "different", first_client).await;
    assert_eq!(
        conflicting_retry.status, 409,
        "body: {}",
        conflicting_retry.body
    );

    let bob_list = bob.get("/api/v1/chat/threads", Some(&bob_cookie)).await;
    assert_eq!(bob_list.status, 200, "body: {}", bob_list.body);
    assert_eq!(bob_list.body["threads"][0]["unread"], 1);
    assert_eq!(
        bob_list.body["threads"][0]["last_message"]["body"],
        "hello Bob"
    );
    let alice_list = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(alice_list.body["threads"][0]["unread"], 0);

    let history = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(history.status, 200, "body: {}", history.body);
    assert_eq!(
        history.body["messages"].as_array().expect("messages").len(),
        1
    );
    assert_eq!(history.body["messages"][0]["body"], "hello Bob");

    let read = bob
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/read"),
            json!({}),
            &bob_cookie,
        )
        .await;
    assert_eq!(read.status, 200, "body: {}", read.body);
    let bob_after_read = bob.get("/api/v1/chat/threads", Some(&bob_cookie)).await;
    assert_eq!(bob_after_read.body["threads"][0]["unread"], 0);

    // Newer page first, older page through `before`.
    let second = send(&alice, &alice_cookie, thread_id, "second", Uuid::new_v4()).await;
    assert_eq!(second.status, 200, "body: {}", second.body);
    let page = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages?limit=1"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(page.status, 200, "body: {}", page.body);
    assert_eq!(page.body["messages"].as_array().expect("messages").len(), 1);
    assert_eq!(page.body["messages"][0]["body"], "second");
    let next_before = page.body["next_before"].as_str().expect("next cursor");
    let older = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages?limit=10&before={next_before}"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(older.status, 200, "body: {}", older.body);
    assert_eq!(
        older.body["messages"].as_array().expect("messages").len(),
        1
    );
    assert_eq!(older.body["messages"][0]["body"], "hello Bob");

    // Non-members cannot read or write.
    let foreign_history = carol
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            Some(&carol_cookie),
        )
        .await;
    assert_eq!(
        foreign_history.status, 404,
        "body: {}",
        foreign_history.body
    );
    let foreign_send = send(&carol, &carol_cookie, thread_id, "nope", Uuid::new_v4()).await;
    assert_eq!(foreign_send.status, 404, "body: {}", foreign_send.body);

    // Validation.
    let empty = send(&alice, &alice_cookie, thread_id, "   ", Uuid::new_v4()).await;
    assert_eq!(empty.status, 400, "body: {}", empty.body);
    let control = send(
        &alice,
        &alice_cookie,
        thread_id,
        "bad\u{0007}",
        Uuid::new_v4(),
    )
    .await;
    assert_eq!(control.status, 400, "body: {}", control.body);
    let too_long = send(
        &alice,
        &alice_cookie,
        thread_id,
        &"x".repeat(4001),
        Uuid::new_v4(),
    )
    .await;
    assert_eq!(too_long.status, 400, "body: {}", too_long.body);

    // Blocking stops sending but leaves history readable.
    let blocked = bob
        .post_with_cookie(
            &format!("/api/v1/users/{_alice_id}/block"),
            json!({}),
            &bob_cookie,
        )
        .await;
    assert_eq!(blocked.status, 200, "body: {}", blocked.body);
    let denied = send(&alice, &alice_cookie, thread_id, "blocked", Uuid::new_v4()).await;
    assert_eq!(denied.status, 403, "body: {}", denied.body);
    let still_readable = alice
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            Some(&alice_cookie),
        )
        .await;
    assert_eq!(still_readable.status, 200, "body: {}", still_readable.body);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
    carol.cleanup(&carol_email).await;
}

#[tokio::test]
async fn a_new_message_unhides_the_conversation_for_the_recipient() {
    let (alice, alice_email, alice_cookie, _alice_id) = account("Unhide Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Unhide Bob").await;
    let thread_id = thread(&alice, &alice_cookie, bob_id).await;

    let hidden = bob
        .delete(
            &format!("/api/v1/chat/threads/{thread_id}"),
            json!({}),
            &bob_cookie,
        )
        .await;
    assert_eq!(hidden.status, 200, "body: {}", hidden.body);
    assert_eq!(
        bob.get("/api/v1/chat/threads", Some(&bob_cookie))
            .await
            .body["threads"]
            .as_array()
            .expect("threads")
            .len(),
        0
    );

    let message = send(&alice, &alice_cookie, thread_id, "ping", Uuid::new_v4()).await;
    assert_eq!(message.status, 200, "body: {}", message.body);
    let visible = bob.get("/api/v1/chat/threads", Some(&bob_cookie)).await;
    assert_eq!(
        visible.body["threads"].as_array().expect("threads").len(),
        1
    );
    assert_eq!(visible.body["threads"][0]["unread"], 1);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}

#[allow(dead_code)]
fn _assert_json(_: &Value) {}
