//! End-to-end tests for registration, login, sessions and logout.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";

fn register_body(email: &str) -> serde_json::Value {
    json!({ "email": email, "password": PASSWORD, "display_name": "Test User" })
}

#[tokio::test]
async fn registration_opens_a_session() {
    let client = TestClient::new().await;
    let email = unique_email();

    let response = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;

    assert_eq!(response.status, 201, "body: {}", response.body);
    assert_eq!(response.body["user"]["email"], email.as_str());
    assert_eq!(response.body["user"]["display_name"], "Test User");
    assert_eq!(response.body["user"]["email_verified"], false);
    assert!(
        response.session_cookie().is_some(),
        "registration must set the session cookie"
    );

    let cookie = response.session_cookie().expect("cookie");
    let me = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(me.status, 200);
    assert_eq!(me.body["user"]["email"], email.as_str());

    client.cleanup(&email).await;
}

#[tokio::test]
async fn login_and_logout_round_trip() {
    let client = TestClient::new().await;
    let email = unique_email();

    client
        .post("/api/v1/auth/register", register_body(&email))
        .await;

    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;

    assert_eq!(login.status, 200, "body: {}", login.body);
    let cookie = login.session_cookie().expect("login sets a cookie");

    let me = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(me.status, 200);

    let logout = client
        .post_with_cookie("/api/v1/auth/logout", json!({}), &cookie)
        .await;
    assert_eq!(logout.status, 204);

    let after = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(after.status, 401, "the session must die immediately");

    // Logging out again is not an error.
    let again = client
        .post_with_cookie("/api/v1/auth/logout", json!({}), &cookie)
        .await;
    assert_eq!(again.status, 204);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn duplicate_email_is_a_conflict_even_in_another_case() {
    let client = TestClient::new().await;
    let email = unique_email();

    let first = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    assert_eq!(first.status, 201);

    let second = client
        .post(
            "/api/v1/auth/register",
            register_body(&email.to_uppercase()),
        )
        .await;

    assert_eq!(second.status, 409, "body: {}", second.body);
    assert_eq!(second.body["error"]["code"], "conflict");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn short_password_reports_the_field() {
    let client = TestClient::new().await;
    let email = unique_email();

    let response = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": "123456789", "display_name": "Test User" }),
        )
        .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "validation_error");
    assert_eq!(response.body["error"]["details"]["field"], "password");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn me_requires_a_session() {
    let client = TestClient::new().await;

    let missing = client.get("/api/v1/me", None).await;
    assert_eq!(missing.status, 401);

    let garbage = client
        .get("/api/v1/me", Some("jey_session=deadbeefdeadbeefdeadbeef"))
        .await;
    assert_eq!(garbage.status, 401);
}

#[tokio::test]
async fn wrong_password_does_not_reveal_whether_the_account_exists() {
    let client = TestClient::new().await;
    let email = unique_email();

    client
        .post("/api/v1/auth/register", register_body(&email))
        .await;

    let wrong = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": "wrong horse battery" }),
        )
        .await;

    let missing = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": unique_email(), "password": PASSWORD }),
        )
        .await;

    assert_eq!(wrong.status, 401);
    assert_eq!(missing.status, 401);
    assert_eq!(wrong.body, missing.body, "responses must be identical");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn state_changing_requests_require_a_known_origin() {
    let client = TestClient::new().await;
    let email = unique_email();

    let missing = client
        .post_with_origin("/api/v1/auth/register", register_body(&email), None)
        .await;
    assert_eq!(missing.status, 403, "body: {}", missing.body);
    assert_eq!(missing.body["error"]["code"], "forbidden");

    let foreign = client
        .post_with_origin(
            "/api/v1/auth/register",
            register_body(&email),
            Some("https://evil.example"),
        )
        .await;
    assert_eq!(foreign.status, 403);

    let allowed = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    assert_eq!(allowed.status, 201);

    client.cleanup(&email).await;
}
