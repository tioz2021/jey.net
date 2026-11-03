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
