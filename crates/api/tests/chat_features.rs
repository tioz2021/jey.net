//! T149: editing, reactions, history search and typing events.

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

async fn thread(client: &TestClient, cookie: &str, peer: Uuid) -> Uuid {
    let response = client
        .post_with_cookie("/api/v1/chat/threads", json!({ "user_id": peer }), cookie)
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    response.body["thread"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

async fn send(client: &TestClient, cookie: &str, thread_id: Uuid, body: &str) -> Uuid {
    let response = client
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "body": body, "client_id": Uuid::new_v4() }),
            cookie,
        )
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    response.body["message"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[tokio::test]
async fn edit_search_reactions_and_typing() {
    let (alice, alice_email, alice_cookie, _) = account("Feature Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Feature Bob").await;
    let thread_id = thread(&alice, &alice_cookie, bob_id).await;
    let first = send(&alice, &alice_cookie, thread_id, "первое сообщение").await;
    send(&bob, &bob_cookie, thread_id, "ответ с яблоком").await;
    send(&alice, &alice_cookie, thread_id, "третье сообщение").await;

    let edited = alice
        .patch(
            &format!("/api/v1/chat/threads/{thread_id}/messages/{first}"),
            json!({ "body": "исправленное сообщение" }),
            &alice_cookie,
        )
        .await;
    assert_eq!(edited.status, 200, "body: {}", edited.body);
    assert_eq!(edited.body["message"]["body"], "исправленное сообщение");
    assert!(edited.body["message"]["edited_at"].is_string());

    let foreign_edit = bob
        .patch(
            &format!("/api/v1/chat/threads/{thread_id}/messages/{first}"),
            json!({ "body": "нельзя" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(foreign_edit.status, 404, "body: {}", foreign_edit.body);

    let search = bob
        .get(
            &format!("/api/v1/chat/threads/{thread_id}/messages?q=яблок"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(search.status, 200, "body: {}", search.body);
    let found = search.body["messages"].as_array().unwrap();
    assert_eq!(found.len(), 1);
    assert!(found[0]["body"].as_str().unwrap().contains("яблок"));

    let reaction = bob
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages/{first}/reactions"),
            json!({ "emoji": "❤️" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(reaction.status, 200, "body: {}", reaction.body);
    assert_eq!(reaction.body["reacted"], true);
    assert_eq!(reaction.body["count"], 1);
    assert_eq!(reaction.body["message"]["reactions"][0]["emoji"], "❤️");

    let toggled = bob
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages/{first}/reactions"),
            json!({ "emoji": "❤️" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(toggled.status, 200, "body: {}", toggled.body);
    assert_eq!(toggled.body["reacted"], false);
    assert_eq!(toggled.body["count"], 0);

    let typing = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/typing"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(typing.status, 200, "body: {}", typing.body);
    assert_eq!(typing.body["typing"], true);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}

#[allow(dead_code)]
fn _keep_value(_: &Value) {}
