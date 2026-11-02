//! Public profiles are opt-in, show only finished records and never leak
//! private fields such as the owner's email or the note attached to a record.

mod common;

use common::{TestClient, pool, purge_test_user, unique_email};
use serde_json::{Value, json};
use uuid::Uuid;

const PASSWORD: &str = "correct horse battery";

async fn account() -> (TestClient, String, String, Value) {
    let client = TestClient::new().await;
    let email = unique_email();

    let response = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Public Person" }),
        )
        .await;

    assert_eq!(response.status, 201, "body: {}", response.body);
    let cookie = response.session_cookie().expect("session cookie");

    (client, email, cookie, response.body["user"].clone())
}

async fn add_item(
    client: &TestClient,
    cookie: &str,
    title: &str,
    status: &str,
    review: Option<&str>,
) -> Value {
    let mut body = json!({ "kind": "movie", "title": title, "status": status });
    if let Some(review) = review {
        body["review"] = json!(review);
    }

    let created = client.post_with_cookie("/api/v1/items", body, cookie).await;

    assert_eq!(created.status, 201, "body: {}", created.body);
    created.body["item"].clone()
}

#[tokio::test]
async fn private_profile_answers_like_a_missing_one() {
    let (client, _email, cookie, user) = account().await;
    let id = user["id"].as_str().expect("user id");

    let hidden = client
        .get(&format!("/api/v1/public/users/{id}"), None)
        .await;
    assert_eq!(hidden.status, 404, "body: {}", hidden.body);

    // Toggling the setting on and off again works both ways.
    let published = client
        .patch("/api/v1/me", json!({ "is_public": true }), &cookie)
        .await;
    assert_eq!(published.status, 200, "body: {}", published.body);
    assert_eq!(
        client
            .get(&format!("/api/v1/public/users/{id}"), None)
            .await
            .status,
        200
    );

    let unpublished = client
        .patch("/api/v1/me", json!({ "is_public": false }), &cookie)
        .await;
    assert_eq!(unpublished.status, 200);
    assert_eq!(
        client
            .get(&format!("/api/v1/public/users/{id}"), None)
            .await
            .status,
        404
    );

    purge_test_user(&pool().await, id.parse::<Uuid>().expect("uuid")).await;
}

#[tokio::test]
async fn public_profile_shows_finished_records_only_and_no_private_fields() {
    let (client, email, cookie, user) = account().await;
    let id = user["id"].as_str().expect("user id").to_owned();

    add_item(&client, &cookie, "Виден", "done", Some("секретная заметка")).await;
    add_item(&client, &cookie, "Черновик", "planned", None).await;

    let removed = add_item(&client, &cookie, "Удалённая", "done", None).await;
    let deleted = client
        .delete(
            &format!("/api/v1/items/{}", removed["id"].as_str().expect("item id")),
            json!({}),
            &cookie,
        )
        .await;
    assert!(deleted.status.is_success(), "delete: {}", deleted.body);

    let published = client
        .patch("/api/v1/me", json!({ "is_public": true }), &cookie)
        .await;
    assert_eq!(published.status, 200);

    let public = client
        .get(&format!("/api/v1/public/users/{id}"), None)
        .await;
    assert_eq!(public.status, 200, "body: {}", public.body);

    let profile = &public.body["profile"];
    assert_eq!(profile["display_name"], "Public Person");
    assert!(profile.get("email").is_none(), "email must not leak");
    assert!(profile.get("is_public").is_none());

    let items = public.body["items"].as_array().expect("items array");
    assert_eq!(items.len(), 1, "only finished records: {}", public.body);
    assert_eq!(items[0]["title"], "Виден");
    assert_eq!(items[0]["kind"], "movie");
    assert!(items[0].get("review").is_none(), "notes must not leak");

    let raw = public.body.to_string();
    assert!(!raw.contains("секретная заметка"));
    assert!(!raw.contains(&email));
    assert!(!raw.contains("Черновик"));
    assert!(!raw.contains("Удалённая"));

    let listing = client.get("/api/v1/public/users", None).await;
    assert_eq!(listing.status, 200);
    let listed = listing.body["users"].as_array().expect("users array");
    assert!(
        listed.iter().any(|user| user["id"] == id.as_str()),
        "public profile must appear in the sitemap listing"
    );

    purge_test_user(&pool().await, id.parse::<Uuid>().expect("uuid")).await;
}

#[tokio::test]
async fn private_profiles_are_not_listed() {
    let (client, _email, _cookie, _user) = account().await;

    let listing = client.get("/api/v1/public/users", None).await;
    assert_eq!(listing.status, 200);

    let listed = listing.body["users"].as_array().expect("users array");
    assert!(
        listed.iter().all(|user| user["id"] != _user["id"]),
        "private profile must stay out of the listing"
    );
}

#[tokio::test]
async fn public_record_is_readable_without_private_fields() {
    let (client, email, cookie, user) = account().await;
    let user_id = user["id"].as_str().expect("user id").to_owned();

    let visible = add_item(&client, &cookie, "Открытая", "done", Some("секрет")).await;
    let hidden = add_item(&client, &cookie, "Черновик", "planned", None).await;

    client
        .patch("/api/v1/me", json!({ "is_public": true }), &cookie)
        .await;

    let item_id = visible["id"].as_str().expect("item id");
    let response = client
        .get(
            &format!("/api/v1/public/users/{user_id}/items/{item_id}"),
            None,
        )
        .await;
    assert_eq!(response.status, 200, "body: {}", response.body);
    assert_eq!(response.body["item"]["title"], "Открытая");
    assert!(response.body["item"].get("review").is_none());
    assert!(!response.body.to_string().contains(&email));

    let planned_id = hidden["id"].as_str().expect("item id");
    assert_eq!(
        client
            .get(
                &format!("/api/v1/public/users/{user_id}/items/{planned_id}"),
                None,
            )
            .await
            .status,
        404
    );

    purge_test_user(&pool().await, user_id.parse::<Uuid>().expect("uuid")).await;
}

#[tokio::test]
async fn malformed_id_is_a_validation_error() {
    let client = TestClient::new().await;

    let response = client.get("/api/v1/public/users/not-a-uuid", None).await;
    assert_eq!(response.status, 400, "body: {}", response.body);
}
