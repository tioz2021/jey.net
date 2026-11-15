//! T135: direct thread lifecycle, membership and privacy boundaries.

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

async fn create_thread(client: &TestClient, cookie: &str, peer: Uuid) -> common::TestResponse {
    client
        .post_with_cookie("/api/v1/chat/threads", json!({ "user_id": peer }), cookie)
        .await
}

#[tokio::test]
async fn direct_threads_are_idempotent_and_private() {
    let (alice, alice_email, alice_cookie, alice_id) = account("Thread Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Thread Bob").await;
    let (carol, carol_email, carol_cookie, _carol_id) = account("Thread Carol").await;

    let created = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(created.status, 200, "body: {}", created.body);
    assert_eq!(created.body["created"], true);
    let thread_id = created.body["thread"]["id"]
        .as_str()
        .expect("thread id")
        .to_owned();
    assert_eq!(created.body["thread"]["peer"]["id"], bob_id.to_string());

    // Both directions resolve to the same direct conversation.
    let reverse = create_thread(&bob, &bob_cookie, alice_id).await;
    assert_eq!(reverse.status, 200, "body: {}", reverse.body);
    assert_eq!(reverse.body["created"], false);
    assert_eq!(reverse.body["thread"]["id"], thread_id);

    let alice_list = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(alice_list.status, 200, "body: {}", alice_list.body);
    assert_eq!(
        alice_list.body["threads"]
            .as_array()
            .expect("threads")
            .len(),
        1
    );
    assert_eq!(alice_list.body["threads"][0]["unread"], 0);

    // A non-member cannot open or hide the conversation.
    let foreign = carol
        .get(
            &format!("/api/v1/chat/threads/{thread_id}"),
            Some(&carol_cookie),
        )
        .await;
    assert_eq!(foreign.status, 404, "body: {}", foreign.body);
    let foreign_hide = carol
        .delete(
            &format!("/api/v1/chat/threads/{thread_id}"),
            json!({}),
            &carol_cookie,
        )
        .await;
    assert_eq!(foreign_hide.status, 404, "body: {}", foreign_hide.body);

    // Self-conversation is rejected.
    let self_thread = create_thread(&alice, &alice_cookie, alice_id).await;
    assert_eq!(self_thread.status, 400, "body: {}", self_thread.body);

    // Blocking prevents creating a conversation.
    let blocked = alice
        .post_with_cookie(
            &format!("/api/v1/users/{bob_id}/block"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(blocked.status, 200, "body: {}", blocked.body);
    let cannot_start = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(cannot_start.status, 403, "body: {}", cannot_start.body);

    let unblocked = alice
        .delete(
            &format!("/api/v1/users/{bob_id}/block"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(unblocked.status, 200, "body: {}", unblocked.body);

    // Hiding is per account: Alice's inbox no longer shows it, Bob's still does.
    let hidden = alice
        .delete(
            &format!("/api/v1/chat/threads/{thread_id}"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(hidden.status, 200, "body: {}", hidden.body);
    let alice_after = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(
        alice_after.body["threads"]
            .as_array()
            .expect("threads")
            .len(),
        0
    );
    let bob_after = bob.get("/api/v1/chat/threads", Some(&bob_cookie)).await;
    assert_eq!(
        bob_after.body["threads"].as_array().expect("threads").len(),
        1
    );

    // Starting it again unhides the existing thread instead of duplicating it.
    let reopened = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(reopened.status, 200, "body: {}", reopened.body);
    assert_eq!(reopened.body["created"], false);
    assert_eq!(reopened.body["thread"]["id"], thread_id);
    let alice_reopened = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(
        alice_reopened.body["threads"]
            .as_array()
            .expect("threads")
            .len(),
        1
    );

    let muted = alice
        .post_with_cookie(
            &format!("/api/v1/chat/threads/{thread_id}/mute"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(muted.status, 200, "body: {}", muted.body);
    let muted_list = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(muted_list.body["threads"][0]["muted"], true);
    let unmuted = alice
        .delete(
            &format!("/api/v1/chat/threads/{thread_id}/mute"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(unmuted.status, 200, "body: {}", unmuted.body);
    let unmuted_list = alice.get("/api/v1/chat/threads", Some(&alice_cookie)).await;
    assert_eq!(unmuted_list.body["threads"][0]["muted"], false);

    // "nobody" is enforced before an existing thread is returned.
    sqlx::query(
        "insert into chat_settings (user_id, message_policy) values ($1, 'nobody')
         on conflict (user_id) do update set message_policy = 'nobody'",
    )
    .bind(bob_id)
    .execute(bob.pool())
    .await
    .expect("set policy");
    let denied = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(denied.status, 403, "body: {}", denied.body);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
    carol.cleanup(&carol_email).await;
}

#[tokio::test]
async fn following_policy_allows_only_followed_senders() {
    let (alice, alice_email, alice_cookie, alice_id) = account("Policy Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Policy Bob").await;

    sqlx::query("insert into chat_settings (user_id, message_policy) values ($1, 'following')")
        .bind(bob_id)
        .execute(bob.pool())
        .await
        .expect("set policy");

    let denied = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(denied.status, 403, "body: {}", denied.body);

    // Bob follows Alice: Alice may now start the conversation.
    let followed = bob
        .post_with_cookie(
            &format!("/api/v1/users/{alice_id}/follow"),
            json!({}),
            &bob_cookie,
        )
        .await;
    assert_eq!(followed.status, 200, "body: {}", followed.body);
    let allowed = create_thread(&alice, &alice_cookie, bob_id).await;
    assert_eq!(allowed.status, 200, "body: {}", allowed.body);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}

#[allow(dead_code)]
fn _assert_value_shape(_: &Value) {}
