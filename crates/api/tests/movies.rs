//! Movie endpoints: authentication first, configuration second.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";

#[tokio::test]
async fn movie_endpoints_require_auth_and_a_tmdb_token() {
    let client = TestClient::new().await;
    let email = unique_email();

    let anonymous = client.get("/api/v1/movies/search?q=test", None).await;
    assert_eq!(anonymous.status, 401);

    let anonymous_tv = client.get("/api/v1/tv/search?q=test", None).await;
    assert_eq!(anonymous_tv.status, 401);

    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Movies" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");

    // Test configs have no TMDB token: the route exists but is unavailable.
    let search = client
        .get("/api/v1/movies/search?q=test", Some(&cookie))
        .await;
    assert_eq!(search.status, 503, "body: {}", search.body);

    let details = client.get("/api/v1/movies/49018", Some(&cookie)).await;
    assert_eq!(details.status, 503, "body: {}", details.body);

    let tv_search = client.get("/api/v1/tv/search?q=test", Some(&cookie)).await;
    assert_eq!(tv_search.status, 503, "body: {}", tv_search.body);

    let tv_details = client.get("/api/v1/tv/70523", Some(&cookie)).await;
    assert_eq!(tv_details.status, 503, "body: {}", tv_details.body);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn poster_requires_tmdb_and_an_external_id() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Poster" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");

    let linked = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": "Астрал",
                "status": "done",
                "external_source": "tmdb",
                "external_id": "49018"
            }),
            &cookie,
        )
        .await;
    let linked_id = linked.body["item"]["id"].as_str().expect("id").to_owned();

    // No TMDB token in tests: the endpoint exists but is unavailable.
    let unavailable = client
        .post_with_cookie(
            &format!("/api/v1/items/{linked_id}/poster"),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(unavailable.status, 503, "body: {}", unavailable.body);

    let manual = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Без TMDB", "status": "done" }),
            &cookie,
        )
        .await;
    let manual_id = manual.body["item"]["id"].as_str().expect("id").to_owned();

    let rejected = client
        .post_with_cookie(
            &format!("/api/v1/items/{manual_id}/poster"),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(rejected.status, 400, "body: {}", rejected.body);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn tv_items_accept_in_progress_and_filter_by_kind() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "TV" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "tv",
                "title": "Тьма",
                "status": "in_progress",
                "rating": 9
            }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, 201, "body: {}", created.body);
    assert_eq!(created.body["item"]["kind"], "tv");
    assert_eq!(created.body["item"]["status"], "in_progress");

    let listed = client.get("/api/v1/items?kind=tv", Some(&cookie)).await;
    assert_eq!(listed.status, 200, "body: {}", listed.body);
    assert_eq!(listed.body["items"][0]["title"], "Тьма");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn refresh_requires_tmdb_and_an_imported_record() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Refresh" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("cookie");

    let linked = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": "Астрал",
                "status": "done",
                "external_source": "tmdb",
                "external_id": "49018"
            }),
            &cookie,
        )
        .await;
    let linked_id = linked.body["item"]["id"].as_str().expect("id").to_owned();

    let unavailable = client
        .post_with_cookie(
            &format!("/api/v1/items/{linked_id}/refresh"),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(unavailable.status, 503, "body: {}", unavailable.body);

    let manual = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Ручной", "status": "done" }),
            &cookie,
        )
        .await;
    let manual_id = manual.body["item"]["id"].as_str().expect("id").to_owned();

    let rejected = client
        .post_with_cookie(
            &format!("/api/v1/items/{manual_id}/refresh"),
            json!({}),
            &cookie,
        )
        .await;
    assert_eq!(rejected.status, 400, "body: {}", rejected.body);

    client.cleanup(&email).await;
}
