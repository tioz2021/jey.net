//! Follows, blocks and the feed stay private and respect public statuses.

mod common;

use common::{TestClient, pool, purge_test_user, unique_email};
use serde_json::{Value, json};
use uuid::Uuid;

const PASSWORD: &str = "correct horse battery";

async fn account(name: &str) -> (TestClient, String, String, Value) {
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
    (client, email, cookie, response.body["user"].clone())
}

#[tokio::test]
async fn follows_blocks_and_feed_respect_public_boundaries() {
    let (alice, alice_email, alice_cookie, alice_user) = account("Alice").await;
    let (bob, bob_email, bob_cookie, bob_user) = account("Bob").await;
    let bob_id = bob_user["id"].as_str().expect("bob id");

    // Accounts start public; make Bob private for the boundary check.
    let made_private = bob
        .patch("/api/v1/me", json!({ "is_public": false }), &bob_cookie)
        .await;
    assert_eq!(made_private.status, 200, "body: {}", made_private.body);

    // Bob is private: Alice cannot follow him.
    let private = alice
        .post_with_cookie(
            &format!("/api/v1/users/{bob_id}/follow"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(private.status, 404, "body: {}", private.body);

    let published = bob
        .patch("/api/v1/me", json!({ "is_public": true }), &bob_cookie)
        .await;
    assert_eq!(published.status, 200, "body: {}", published.body);

    let done = bob
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Bob's public film", "status": "done" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(done.status, 201, "body: {}", done.body);
    let planned = bob
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Bob's draft", "status": "planned" }),
            &bob_cookie,
        )
        .await;
    assert_eq!(planned.status, 201, "body: {}", planned.body);

    // Self-follow is rejected.
    let self_follow = alice
        .post_with_cookie(
            &format!(
                "/api/v1/users/{}/follow",
                alice_user["id"].as_str().expect("alice id")
            ),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(self_follow.status, 400, "body: {}", self_follow.body);

    let followed = alice
        .post_with_cookie(
            &format!("/api/v1/users/{bob_id}/follow"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(followed.status, 200, "body: {}", followed.body);
    assert_eq!(followed.body["following"], true);

    let feed = alice.get("/api/v1/feed", Some(&alice_cookie)).await;
    assert_eq!(feed.status, 200, "body: {}", feed.body);
    let items = feed.body["items"].as_array().expect("feed array");
    assert_eq!(
        items.len(),
        1,
        "only finished public records: {}",
        feed.body
    );
    assert_eq!(items[0]["title"], "Bob's public film");
    assert_eq!(items[0]["author_name"], "Bob");
    assert_eq!(items[0]["author_id"], bob_id);

    let following = alice
        .get("/api/v1/follows/following", Some(&alice_cookie))
        .await;
    assert_eq!(following.status, 200, "body: {}", following.body);
    assert_eq!(following.body["people"][0]["notifications"], true);

    let muted = alice
        .patch(
            &format!("/api/v1/users/{bob_id}/follow/notifications"),
            json!({ "enabled": false }),
            &alice_cookie,
        )
        .await;
    assert_eq!(muted.status, 200, "body: {}", muted.body);
    let muted_feed = alice.get("/api/v1/feed", Some(&alice_cookie)).await;
    assert_eq!(muted_feed.status, 200);
    assert!(
        muted_feed.body["items"]
            .as_array()
            .expect("array")
            .is_empty()
    );

    let unmuted = alice
        .patch(
            &format!("/api/v1/users/{bob_id}/follow/notifications"),
            json!({ "enabled": true }),
            &alice_cookie,
        )
        .await;
    assert_eq!(unmuted.status, 200, "body: {}", unmuted.body);

    // Blocking removes the relationship and hides the feed.
    let blocked = alice
        .post_with_cookie(
            &format!("/api/v1/users/{bob_id}/block"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(blocked.status, 200, "body: {}", blocked.body);
    assert_eq!(blocked.body["blocked"], true);

    let follow_after_block = alice
        .post_with_cookie(
            &format!("/api/v1/users/{bob_id}/follow"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(
        follow_after_block.status, 403,
        "body: {}",
        follow_after_block.body
    );

    let empty_feed = alice.get("/api/v1/feed", Some(&alice_cookie)).await;
    assert_eq!(empty_feed.status, 200);
    assert!(
        empty_feed.body["items"]
            .as_array()
            .expect("array")
            .is_empty()
    );

    let status = alice
        .get(
            &format!("/api/v1/users/{bob_id}/follow"),
            Some(&alice_cookie),
        )
        .await;
    assert_eq!(status.status, 200, "body: {}", status.body);
    assert_eq!(status.body["blocked"], true);
    assert_eq!(status.body["following"], false);

    let unblocked = alice
        .delete(
            &format!("/api/v1/users/{bob_id}/block"),
            json!({}),
            &alice_cookie,
        )
        .await;
    assert_eq!(unblocked.status, 200, "body: {}", unblocked.body);
    assert_eq!(unblocked.body["blocked"], false);

    purge_test_user(
        &pool().await,
        alice_user["id"].as_str().unwrap().parse::<Uuid>().unwrap(),
    )
    .await;
    purge_test_user(
        &pool().await,
        bob_user["id"].as_str().unwrap().parse::<Uuid>().unwrap(),
    )
    .await;
    let _ = (alice_email, bob_email);
}
