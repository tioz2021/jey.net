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
