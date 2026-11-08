mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};
use uuid::Uuid;

use common::TestClient;

async fn setup() -> (TestClient, String) {
    let client = TestClient::new().await;
    let email = format!("social-conflict-{}@example.test", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": "correct horse battery", "display_name": "Social" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session");
    (client, cookie)
}

#[tokio::test]
async fn duplicate_collection_keeps_both_versions() {
    let (client, cookie) = setup().await;
    let id = Uuid::new_v4();

    let first = client
        .post_with_cookie(
            "/api/v1/collections",
            json!({ "id": id, "title": "Collection A", "visibility": "private" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);

    let second = client
        .post_with_cookie(
            "/api/v1/collections",
            json!({ "id": id, "title": "Collection B", "visibility": "private" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::CONFLICT);

    let (status, _, bytes) = client
        .get_bytes("/api/v1/social/conflicts", Some(&cookie), &[])
        .await;
    assert_eq!(status, StatusCode::OK);
    let open: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(open["conflicts"].as_array().unwrap().len(), 1);
    let conflict = &open["conflicts"][0];
    assert_eq!(conflict["entity"], "collection");
    assert_eq!(conflict["incoming"]["title"], "Collection B");
    assert_eq!(conflict["stored"]["title"], "Collection A");

    let conflict_id = conflict["conflict_id"].as_str().unwrap();
    let resolved = client
        .post_with_cookie(
            &format!("/api/v1/social/conflicts/{conflict_id}/resolve"),
            json!({ "keep": "incoming" }),
            &cookie,
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK);
    let (_, _, bytes) = client
        .get_bytes(&format!("/api/v1/collections/{id}"), Some(&cookie), &[])
        .await;
    let collection: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(collection["collection"]["title"], "Collection B");
    let (_, _, bytes) = client
        .get_bytes("/api/v1/social/conflicts", Some(&cookie), &[])
        .await;
    let open: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(open["conflicts"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn duplicate_comment_keeps_both_versions() {
    let (client, cookie) = setup().await;
    let (_, _, me_bytes) = client.get_bytes("/api/v1/me", Some(&cookie), &[]).await;
    let me: Value = serde_json::from_slice(&me_bytes).unwrap();
    let user_id = me["user"]["id"].as_str().unwrap();
    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie", "title": "Social item",
                "status": "done", "public_hidden": false
            }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.body);
    let item_id = created.body["item"]["id"].as_str().unwrap();

    let comment_id = Uuid::new_v4();
    let path = format!("/api/v1/public/users/{user_id}/items/{item_id}/comments");
    let first = client
        .post_with_cookie(
            &path,
            json!({ "id": comment_id, "body": "Comment A" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    let second = client
        .post_with_cookie(
            &path,
            json!({ "id": comment_id, "body": "Comment B" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::CONFLICT, "{}", second.body);

    let (_, _, bytes) = client
        .get_bytes("/api/v1/social/conflicts", Some(&cookie), &[])
        .await;
    let open: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(open["conflicts"].as_array().unwrap().len(), 1);
    let conflict = &open["conflicts"][0];
    assert_eq!(conflict["entity"], "comment");
    assert_eq!(conflict["incoming"]["body"], "Comment B");
    assert_eq!(conflict["stored"]["body"], "Comment A");
}
