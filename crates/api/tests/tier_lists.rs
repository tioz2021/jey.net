//! T152: private/public tier lists and their item visibility rules.

mod common;

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

async fn item(client: &TestClient, cookie: &str, title: &str, hidden: bool) -> Uuid {
    let response = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": title, "status": "done", "public_hidden": hidden }),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);
    response.body["item"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[tokio::test]
async fn tier_lists_are_private_until_published_and_hide_private_items() {
    let (alice, alice_email, alice_cookie, alice_id) = account("Tier Alice").await;
    let (bob, bob_email, bob_cookie, _) = account("Tier Bob").await;
    let visible = item(&alice, &alice_cookie, "Visible tier item", false).await;
    let hidden = item(&alice, &alice_cookie, "Hidden tier item", true).await;

    let created = alice
        .post_with_cookie(
            "/api/v1/tier-lists",
            json!({ "title": "Лучшее", "visibility": "public" }),
            &alice_cookie,
        )
        .await;
    assert_eq!(created.status, 201, "body: {}", created.body);
    let id = created.body["id"].as_str().unwrap();
    let slug = created.body["slug"].as_str().unwrap();

    let first = alice
        .put(
            &format!("/api/v1/tier-lists/{id}/items/{visible}"),
            json!({ "tier": "S", "position": 0 }),
            &alice_cookie,
        )
        .await;
    assert_eq!(first.status, 200, "body: {}", first.body);
    let second = alice
        .put(
            &format!("/api/v1/tier-lists/{id}/items/{hidden}"),
            json!({ "tier": "A", "position": 1 }),
            &alice_cookie,
        )
        .await;
    assert_eq!(second.status, 200, "body: {}", second.body);

    let owner = alice
        .get(&format!("/api/v1/tier-lists/{id}"), Some(&alice_cookie))
        .await;
    assert_eq!(owner.body["items"].as_array().unwrap().len(), 2);
    assert_eq!(owner.body["items"][0]["tier"], "A");

    let public = bob
        .get(
            &format!("/api/v1/public/users/{alice_id}/tier-lists/{slug}"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(public.status, 200, "body: {}", public.body);
    assert_eq!(public.body["items"].as_array().unwrap().len(), 1);
    assert_eq!(public.body["items"][0]["title"], "Visible tier item");

    let private = alice
        .patch(
            &format!("/api/v1/tier-lists/{id}"),
            json!({ "title": "Лучшее", "visibility": "private" }),
            &alice_cookie,
        )
        .await;
    assert_eq!(private.status, 200, "body: {}", private.body);
    let hidden_public = bob
        .get(
            &format!("/api/v1/public/users/{alice_id}/tier-lists/{slug}"),
            None,
        )
        .await;
    assert_eq!(hidden_public.status, 404, "body: {}", hidden_public.body);

    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}
