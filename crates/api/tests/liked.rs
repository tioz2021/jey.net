//! T163: liked records are listed for the current user.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";

async fn account(name: &str) -> (TestClient, String, String) {
    let client = TestClient::new().await;
    let email = unique_email();
    let response = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": name }),
        )
        .await;
    assert_eq!(response.status, 201, "body: {}", response.body);
    (client, email, response.session_cookie().expect("cookie"))
}

#[tokio::test]
async fn liked_lists_and_unlikes_records() {
    let (viewer, viewer_email, viewer_cookie) = account("Liked Viewer").await;
    let (author, author_email, author_cookie) = account("Liked Author").await;

    let created = author
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Liked Movie", "status": "done", "rating": 9 }),
            &author_cookie,
        )
        .await;
    assert_eq!(created.status, 201, "body: {}", created.body);
    let item_id = created.body["item"]["id"].as_str().unwrap();

    let liked = viewer
        .post_with_cookie(
            &format!("/api/v1/public/items/{item_id}/reactions"),
            json!({}),
            &viewer_cookie,
        )
        .await;
    assert_eq!(liked.status, 200, "body: {}", liked.body);

    let response = viewer.get("/api/v1/liked", Some(&viewer_cookie)).await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    assert_eq!(response.body["items"][0]["title"], "Liked Movie");
    assert_eq!(response.body["items"][0]["author_name"], "Liked Author");

    viewer
        .post_with_cookie(
            &format!("/api/v1/public/items/{item_id}/reactions"),
            json!({}),
            &viewer_cookie,
        )
        .await;
    let empty = viewer.get("/api/v1/liked", Some(&viewer_cookie)).await;
    assert!(empty.body["items"].as_array().unwrap().is_empty());

    viewer.cleanup(&viewer_email).await;
    author.cleanup(&author_email).await;
}

#[tokio::test]
async fn reaction_put_sets_exact_state_for_offline_outbox() {
    let (viewer, viewer_email, viewer_cookie) = account("Liked Set Viewer").await;
    let (author, author_email, author_cookie) = account("Liked Set Author").await;
    let created = author
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Set Liked Movie", "status": "done", "rating": 9 }),
            &author_cookie,
        )
        .await;
    let item_id = created.body["item"]["id"].as_str().unwrap();

    let on = viewer
        .put(
            &format!("/api/v1/public/items/{item_id}/reactions"),
            json!({ "liked": true }),
            &viewer_cookie,
        )
        .await;
    assert_eq!(on.status, 200, "body: {}", on.body);
    assert_eq!(on.body["reacted"], true);

    let off = viewer
        .put(
            &format!("/api/v1/public/items/{item_id}/reactions"),
            json!({ "liked": false }),
            &viewer_cookie,
        )
        .await;
    assert_eq!(off.status, 200, "body: {}", off.body);
    assert_eq!(off.body["reacted"], false);

    viewer.cleanup(&viewer_email).await;
    author.cleanup(&author_email).await;
}
