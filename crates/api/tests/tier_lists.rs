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
    let book = alice
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Book outside category", "status": "done" }),
            &alice_cookie,
        )
        .await;
    let book_id = book.body["item"]["id"].as_str().unwrap();

    let created = alice
        .post_with_cookie(
            "/api/v1/tier-lists",
            json!({ "title": "Лучшее", "visibility": "public", "kind": "movie" }),
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
    let wrong_kind = alice
        .put(
            &format!("/api/v1/tier-lists/{id}/items/{book_id}"),
            json!({ "tier": "B", "position": 0 }),
            &alice_cookie,
        )
        .await;
    assert_eq!(wrong_kind.status, 400, "body: {}", wrong_kind.body);

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

    let profile = bob
        .get(
            &format!("/api/v1/public/users/{alice_id}"),
            Some(&bob_cookie),
        )
        .await;
    assert_eq!(profile.status, 200, "body: {}", profile.body);
    let public_lists = profile.body["tier_lists"].as_array().unwrap();
    let listed = public_lists
        .iter()
        .find(|entry| entry["id"] == *id)
        .unwrap();
    assert_eq!(listed["item_count"], 1);

    let private = alice
        .patch(
            &format!("/api/v1/tier-lists/{id}"),
            json!({ "title": "Лучшее", "visibility": "private", "kind": "movie" }),
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

#[tokio::test]
async fn automatic_category_lists_follow_ratings() {
    let (client, email, cookie, _) = account("Auto Tier").await;

    async fn rated(client: &TestClient, cookie: &str, kind: &str, title: &str, rating: u8) -> Uuid {
        let response = client
            .post_with_cookie(
                "/api/v1/items",
                json!({ "kind": kind, "title": title, "status": "done", "rating": rating }),
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

    let top = rated(&client, &cookie, "movie", "Auto top", 10).await;
    let mid = rated(&client, &cookie, "movie", "Auto mid", 5).await;
    let low = rated(&client, &cookie, "movie", "Auto low", 1).await;
    let book = rated(&client, &cookie, "book", "Auto book", 10).await;

    let lists = client.get("/api/v1/tier-lists", Some(&cookie)).await;
    assert_eq!(lists.status, 200, "body: {}", lists.body);
    let all = lists.body["tier_lists"].as_array().unwrap();
    let movie_list = all
        .iter()
        .find(|list| list["auto"] == true && list["kind"] == "movie")
        .unwrap();
    let book_list = all
        .iter()
        .find(|list| list["auto"] == true && list["kind"] == "book")
        .unwrap();
    assert_ne!(movie_list["id"], book_list["id"]);
    let auto_delete = client
        .delete(
            &format!("/api/v1/tier-lists/{}", movie_list["id"].as_str().unwrap()),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(auto_delete.status, 400, "body: {}", auto_delete.body);

    let detail = client
        .get(
            &format!("/api/v1/tier-lists/{}", movie_list["id"].as_str().unwrap()),
            Some(&cookie),
        )
        .await;
    assert_eq!(detail.status, 200, "body: {}", detail.body);
    let items = detail.body["items"].as_array().unwrap();
    assert_eq!(items.len(), 3);
    let tier_of = |id: Uuid| {
        items
            .iter()
            .find(|item| item["id"] == id.to_string())
            .map(|item| item["tier"].clone())
    };
    assert_eq!(tier_of(top), Some(json!("S")));
    assert_eq!(tier_of(mid), Some(json!("C")));
    assert_eq!(tier_of(low), Some(json!("F")));
    let remove_auto = client
        .delete(
            &format!(
                "/api/v1/tier-lists/{}/items/{low}",
                movie_list["id"].as_str().unwrap()
            ),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(remove_auto.status, 400, "body: {}", remove_auto.body);

    let moved = client
        .patch(
            &format!("/api/v1/items/{top}"),
            json!({ "rating": 2 }),
            &cookie,
        )
        .await;
    assert_eq!(moved.status, 200, "body: {}", moved.body);
    let detail = client
        .get(
            &format!("/api/v1/tier-lists/{}", movie_list["id"].as_str().unwrap()),
            Some(&cookie),
        )
        .await;
    let tier = detail.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == top.to_string())
        .map(|item| item["tier"].clone());
    assert_eq!(tier, Some(json!("E")));

    let deleted = client
        .delete(&format!("/api/v1/items/{low}"), json!({}), &cookie)
        .await;
    assert_eq!(deleted.status, 204, "body: {}", deleted.body);
    let detail = client
        .get(
            &format!("/api/v1/tier-lists/{}", movie_list["id"].as_str().unwrap()),
            Some(&cookie),
        )
        .await;
    assert!(
        detail.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["id"] != low.to_string())
    );
    assert!(
        detail.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] != book.to_string())
    );

    client.cleanup(&email).await;
}
