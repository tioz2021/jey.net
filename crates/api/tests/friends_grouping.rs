//! T161: the same record from several friends becomes one recommendation.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;
use uuid::Uuid;

const PASSWORD: &str = "correct horse battery";

async fn account(name: &str) -> (TestClient, String, String, String) {
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
    let id = response.body["user"]["id"].as_str().unwrap().to_owned();
    (client, email, cookie, id)
}

async fn rated_item(client: &TestClient, cookie: &str, title: &str, rating: u8, review: &str) {
    let response = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": title,
                "status": "done",
                "rating": rating,
                "review": review
            }),
            cookie,
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);
}

#[tokio::test]
async fn friends_group_the_same_record() {
    let (viewer, viewer_email, viewer_cookie, _) = account("Group Viewer").await;
    let (alice, alice_email, alice_cookie, alice_id) = account("Group Alice").await;
    let (bob, bob_email, bob_cookie, bob_id) = account("Group Bob").await;

    for (cookie, id) in [(&viewer_cookie, &alice_id), (&viewer_cookie, &bob_id)] {
        let followed = viewer
            .post_with_cookie(&format!("/api/v1/users/{id}/follow"), json!({}), cookie)
            .await;
        assert_eq!(followed.status, 200, "body: {}", followed.body);
    }

    let title = format!("Grouped Movie {}", Uuid::new_v4());
    rated_item(&alice, &alice_cookie, &title, 9, "Alice review").await;
    rated_item(&bob, &bob_cookie, &title, 10, "Bob review").await;

    let response = viewer
        .get(
            "/api/v1/recommendations/friends?kind=movie&period=all&limit=50",
            Some(&viewer_cookie),
        )
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    let card = response.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["title"] == title)
        .expect("grouped recommendation");
    assert_eq!(card["friend_count"], 2);
    assert_eq!(card["average_rating"], 9.5);
    let people = card["friend_people"].as_array().unwrap();
    assert!(people.iter().any(|person| person["name"] == "Group Alice"));
    assert!(people.iter().any(|person| person["name"] == "Group Bob"));
    let reviews = card["reviews"].as_array().unwrap();
    assert_eq!(reviews.len(), 2);
    assert!(
        reviews
            .iter()
            .any(|review| review["review"] == "Alice review")
    );
    assert!(
        reviews
            .iter()
            .any(|review| review["review"] == "Bob review")
    );

    viewer.cleanup(&viewer_email).await;
    alice.cleanup(&alice_email).await;
    bob.cleanup(&bob_email).await;
}
