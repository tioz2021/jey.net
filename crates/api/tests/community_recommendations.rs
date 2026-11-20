//! T154: community recommendations aggregate public ratings across users.

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

async fn rated_item(client: &TestClient, cookie: &str, title: &str, rating: u8) {
    let response = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": title, "status": "done", "rating": rating }),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);
}

#[tokio::test]
async fn community_aggregates_public_ratings_across_profiles() {
    let (viewer, viewer_email, viewer_cookie, _) = account("Community Viewer").await;
    let (alice, alice_email, alice_cookie, alice_id) = account("Community Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Community Bob").await;

    let title = format!("Community Movie {}", Uuid::new_v4());
    rated_item(&alice, &alice_cookie, &title, 9).await;
    rated_item(&bob, &bob_cookie, &title, 10).await;

    let response = viewer
        .get("/api/v1/recommendations/community", Some(&viewer_cookie))
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    let items = response.body["items"].as_array().unwrap();
    let movie = items
        .iter()
        .find(|item| item["title"] == title)
        .expect("community movie");
    assert_eq!(movie["people_count"], 2);
    assert_eq!(movie["average_rating"], 9.5);
    let people = movie["people"].as_array().unwrap();
    assert!(people.iter().any(|p| p["name"] == "Community Alice"));
    assert!(people.iter().any(|p| p["name"] == "Community Bob"));

    viewer.cleanup(&viewer_email).await;
    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
    let _ = (alice_id, bob_id);
}
