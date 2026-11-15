//! T142: message policy API and reporting a chat message.

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

#[tokio::test]
async fn message_policy_can_be_read_and_changed() {
    let (alice, alice_email, alice_cookie, _) = account("Policy Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Policy Bob").await;

    let initial = bob.get("/api/v1/chat/settings", Some(&bob_cookie)).await;
    assert_eq!(initial.status, 200, "body: {}", initial.body);
    assert_eq!(initial.body["message_policy"], "all");

    let invalid = bob
        .patch(
            "/api/v1/chat/settings",
            json!({ "message_policy": "friends" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(invalid.status, 400, "body: {}", invalid.body);

    let nobody = bob
        .patch(
            "/api/v1/chat/settings",
            json!({ "message_policy": "nobody" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(nobody.status, 200, "body: {}", nobody.body);
    assert_eq!(nobody.body["message_policy"], "nobody");
    let denied = alice
        .post_with_cookie(
            "/api/v1/chat/threads",
            json!({ "user_id": bob_id }),
            &alice_cookie,
        )
        .await;
    assert_eq!(denied.status, 403, "body: {}", denied.body);

    let all = bob
        .patch(
            "/api/v1/chat/settings",
            json!({ "message_policy": "all" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(all.status, 200, "body: {}", all.body);
    let allowed = thread(&alice, &alice_cookie, bob_id).await;
    assert!(allowed != Uuid::nil());

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}

#[tokio::test]
async fn chat_messages_can_be_reported_only_by_participants() {
    let (alice, alice_email, alice_cookie, _) = account("Report Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Report Bob").await;
    let (carol, carol_email, carol_cookie, _) = account("Report Carol").await;
    let thread_id = thread(&alice, &alice_cookie, bob_id).await;

    let sent = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/messages"),
            json!({ "body": "report me", "client_id": Uuid::new_v4() }),
            &alice_cookie,
        )
        .await;
    assert_eq!(sent.status, 200, "body: {}", sent.body);
    let message_id = sent.body["message"]["id"].as_str().expect("message id");

    let report = bob
        .post_with_cookie(
            "/api/v1/reports",
            json!({
                "target_type": "chat_message",
                "target_id": message_id,
                "reason": "abuse",
                "details": "test report"
            }),
            &bob_cookie,
        )
        .await;
    assert_eq!(report.status, 200, "body: {}", report.body);

    // The moderation queue resolves the message preview and author.
    sqlx::query("update users set role = 'admin' where id = $1")
        .bind(bob_id)
        .execute(bob.pool())
        .await
        .expect("make moderator");
    let queue = bob.get("/api/v1/reports", Some(&bob_cookie)).await;
    assert_eq!(queue.status, 200, "body: {}", queue.body);
    let reported = queue.body["reports"]
        .as_array()
        .expect("reports")
        .iter()
        .find(|item| item["target_type"] == "chat_message")
        .expect("chat report in queue");
    assert_eq!(reported["target_label"], "report me");
    assert_eq!(reported["target_author"], "Report Alice");

    let foreign = carol
        .post_with_cookie(
            "/api/v1/reports",
            json!({
                "target_type": "chat_message",
                "target_id": message_id,
                "reason": "spam"
            }),
            &carol_cookie,
        )
        .await;
    assert_eq!(foreign.status, 404, "body: {}", foreign.body);

    let own = alice
        .post_with_cookie(
            "/api/v1/reports",
            json!({
                "target_type": "chat_message",
                "target_id": message_id,
                "reason": "abuse"
            }),
            &alice_cookie,
        )
        .await;
    assert_eq!(own.status, 400, "body: {}", own.body);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
    carol.cleanup(&carol_email).await;
}

#[allow(dead_code)]
fn _keep_value(_: &Value) {}
