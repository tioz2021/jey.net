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

const NEW_PASSWORD: &str = "a much better passphrase";

#[tokio::test]
async fn password_change_keeps_the_current_session_and_drops_others() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let first = registered.session_cookie().expect("registration cookie");

    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    let second = login.session_cookie().expect("login cookie");
    assert_ne!(first, second);

    let changed = client
        .post_with_cookie(
            "/api/v1/me/password",
            json!({ "current_password": PASSWORD, "new_password": NEW_PASSWORD }),
            &first,
        )
        .await;
    assert_eq!(changed.status, 204, "body: {}", changed.body);

    // The session that changed the password stays valid.
    assert_eq!(client.get("/api/v1/me", Some(&first)).await.status, 200);
    // Every other session is gone.
    assert_eq!(client.get("/api/v1/me", Some(&second)).await.status, 401);

    let old_login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    assert_eq!(old_login.status, 401, "the old password must stop working");

    let new_login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(new_login.status, 200, "body: {}", new_login.body);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn password_change_validates_its_inputs() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");

    let wrong_current = client
        .post_with_cookie(
            "/api/v1/me/password",
            json!({ "current_password": "not the password", "new_password": NEW_PASSWORD }),
            &cookie,
        )
        .await;
    assert_eq!(wrong_current.status, 400);
    assert_eq!(
        wrong_current.body["error"]["details"]["field"],
        "current_password"
    );

    let same_as_old = client
        .post_with_cookie(
            "/api/v1/me/password",
            json!({ "current_password": PASSWORD, "new_password": PASSWORD }),
            &cookie,
        )
        .await;
    assert_eq!(same_as_old.status, 400);
    assert_eq!(
        same_as_old.body["error"]["details"]["field"],
        "new_password"
    );

    let too_short = client
        .post_with_cookie(
            "/api/v1/me/password",
            json!({ "current_password": PASSWORD, "new_password": "short" }),
            &cookie,
        )
        .await;
    assert_eq!(too_short.status, 400);
    assert_eq!(too_short.body["error"]["details"]["field"], "new_password");

    // Nothing changed: the original password still works.
    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    assert_eq!(login.status, 200);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn profile_can_be_read_and_updated() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");

    let before = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(before.status, 200);
    assert_eq!(before.body["user"]["display_name"], "Test User");
    assert_eq!(before.body["user"]["locale"], "ru");
    assert_eq!(before.body["user"]["is_public"], false);

    let updated = client
        .patch(
            "/api/v1/me",
            json!({ "display_name": "  New Name  ", "locale": "en", "is_public": true }),
            &cookie,
        )
        .await;
    assert_eq!(updated.status, 200, "body: {}", updated.body);
    assert_eq!(updated.body["user"]["display_name"], "New Name");
    assert_eq!(updated.body["user"]["locale"], "en");
    assert_eq!(updated.body["user"]["is_public"], true);

    let after = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(after.body["user"]["display_name"], "New Name");
    assert_eq!(after.body["user"]["locale"], "en");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn profile_update_validates_input() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");

    let empty = client.patch("/api/v1/me", json!({}), &cookie).await;
    assert_eq!(empty.status, 400);

    let blank = client
        .patch("/api/v1/me", json!({ "display_name": "   " }), &cookie)
        .await;
    assert_eq!(blank.status, 400);
    assert_eq!(blank.body["error"]["details"]["field"], "display_name");

    let too_long = client
        .patch(
            "/api/v1/me",
            json!({ "display_name": "a".repeat(61) }),
            &cookie,
        )
        .await;
    assert_eq!(too_long.status, 400);

    let bad_locale = client
        .patch("/api/v1/me", json!({ "locale": "de" }), &cookie)
        .await;
    assert_eq!(bad_locale.status, 400);
    assert_eq!(bad_locale.body["error"]["details"]["field"], "locale");

    // Nothing changed.
    let me = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(me.body["user"]["display_name"], "Test User");
    assert_eq!(me.body["user"]["locale"], "ru");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn deleting_the_account_removes_access_and_frees_the_email() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    let wrong_password = client
        .delete(
            "/api/v1/me",
            json!({ "password": "not the password" }),
            &cookie,
        )
        .await;
    assert_eq!(wrong_password.status, 400);
    assert_eq!(wrong_password.body["error"]["details"]["field"], "password");

    let deleted = client
        .delete("/api/v1/me", json!({ "password": PASSWORD }), &cookie)
        .await;
    assert_eq!(deleted.status, 204, "body: {}", deleted.body);

    // The old session and the old credentials are dead.
    assert_eq!(client.get("/api/v1/me", Some(&cookie)).await.status, 401);
    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    assert_eq!(login.status, 401);

    // A second deletion attempt is just an unauthenticated request.
    let again = client
        .delete("/api/v1/me", json!({ "password": PASSWORD }), &cookie)
        .await;
    assert_eq!(again.status, 401);

    // The row is anonymised but kept.
    let (stored_email, is_deleted) = client.user_state(user_id).await.expect("row exists");
    assert!(is_deleted, "deleted_at must be set");
    assert!(
        stored_email.starts_with("deleted-") && stored_email.ends_with("@invalid"),
        "unexpected email: {stored_email}"
    );

    // The address itself is free again.
    let fresh = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    assert_eq!(fresh.status, 201, "body: {}", fresh.body);

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

fn token_from(message: &str) -> String {
    let marker = "token=";
    let start = message.find(marker).expect("link with a token") + marker.len();

    message[start..]
        .split(|ch: char| ch.is_whitespace())
        .next()
        .expect("token value")
        .to_owned()
}

#[tokio::test]
async fn verification_link_confirms_the_email_once() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    assert_eq!(registered.status, 201);
    let cookie = registered.session_cookie().expect("registration cookie");
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    let message = client.mailer.last().expect("a verification letter");
    assert_eq!(message.to, email);
    assert!(message.text.contains("/verify-email?token="));

    let token = token_from(&message.text);

    let verified = client
        .post("/api/v1/auth/verify-email", json!({ "token": token }))
        .await;
    assert_eq!(verified.status, 204, "body: {}", verified.body);

    let me = client.get("/api/v1/me", Some(&cookie)).await;
    assert_eq!(me.body["user"]["email_verified"], true);

    // The same link cannot be used twice.
    let again = client
        .post("/api/v1/auth/verify-email", json!({ "token": token }))
        .await;
    assert_eq!(again.status, 400);
    assert_eq!(again.body["error"]["details"]["field"], "token");

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

#[tokio::test]
async fn expired_verification_token_is_rejected() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    let token = token_from(&client.mailer.last().expect("letter").text);
    client.expire_auth_tokens(user_id).await;

    let response = client
        .post("/api/v1/auth/verify-email", json!({ "token": token }))
        .await;
    assert_eq!(response.status, 400);

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

#[tokio::test]
async fn resending_the_letter_is_rate_limited() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    let first = client
        .post_with_cookie("/api/v1/auth/verify-email/resend", json!({}), &cookie)
        .await;
    assert_eq!(first.status, 204, "body: {}", first.body);

    let second = client
        .post_with_cookie("/api/v1/auth/verify-email/resend", json!({}), &cookie)
        .await;
    assert_eq!(second.status, 429);
    assert_eq!(second.body["error"]["code"], "rate_limited");

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

#[tokio::test]
async fn password_reset_changes_the_password_and_ends_every_session() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let first_cookie = registered.session_cookie().expect("registration cookie");
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    let second_cookie = login.session_cookie().expect("login cookie");

    let requested = client
        .post(
            "/api/v1/auth/password-reset/request",
            json!({ "email": email }),
        )
        .await;
    assert_eq!(requested.status, 202, "body: {}", requested.body);

    let message = client.mailer.last().expect("reset letter");
    assert!(message.text.contains("/reset-password?token="));
    let token = token_from(&message.text);

    let confirmed = client
        .post(
            "/api/v1/auth/password-reset/confirm",
            json!({ "token": token, "new_password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(confirmed.status, 204, "body: {}", confirmed.body);

    // Every session is gone, including the one that registered.
    assert_eq!(
        client.get("/api/v1/me", Some(&first_cookie)).await.status,
        401
    );
    assert_eq!(
        client.get("/api/v1/me", Some(&second_cookie)).await.status,
        401
    );

    let old_login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    assert_eq!(old_login.status, 401);

    let new_login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(new_login.status, 200, "body: {}", new_login.body);

    // The link cannot be reused.
    let again = client
        .post(
            "/api/v1/auth/password-reset/confirm",
            json!({ "token": token, "new_password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(again.status, 400);

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

#[tokio::test]
async fn password_reset_request_does_not_reveal_accounts() {
    let client = TestClient::new().await;
    let known = unique_email();
    let unknown = unique_email();

    client
        .post("/api/v1/auth/register", register_body(&known))
        .await;

    let before = client.mailer.sent().len();
    let for_unknown = client
        .post(
            "/api/v1/auth/password-reset/request",
            json!({ "email": unknown }),
        )
        .await;
    let after_unknown = client.mailer.sent().len();

    let for_known = client
        .post(
            "/api/v1/auth/password-reset/request",
            json!({ "email": known }),
        )
        .await;
    let after_known = client.mailer.sent().len();

    assert_eq!(for_unknown.status, 202);
    assert_eq!(for_known.status, 202);
    assert_eq!(after_unknown, before, "no letter for an unknown address");
    assert_eq!(after_known, before + 1, "one letter for a known address");

    client.cleanup(&known).await;
    client.cleanup(&unknown).await;
}

#[tokio::test]
async fn password_reset_requests_are_rate_limited() {
    let client = TestClient::new().await;
    let email = unique_email();

    for _ in 0..3 {
        let response = client
            .post(
                "/api/v1/auth/password-reset/request",
                json!({ "email": email }),
            )
            .await;
        assert_eq!(response.status, 202);
    }

    let fourth = client
        .post(
            "/api/v1/auth/password-reset/request",
            json!({ "email": email }),
        )
        .await;
    assert_eq!(fourth.status, 429);
    assert_eq!(fourth.body["error"]["code"], "rate_limited");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn expired_reset_token_is_rejected() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let user_id: uuid::Uuid = registered.body["user"]["id"]
        .as_str()
        .expect("user id")
        .parse()
        .expect("valid uuid");

    client
        .post(
            "/api/v1/auth/password-reset/request",
            json!({ "email": email }),
        )
        .await;
    let token = token_from(&client.mailer.last().expect("reset letter").text);
    client.expire_auth_tokens(user_id).await;

    let response = client
        .post(
            "/api/v1/auth/password-reset/confirm",
            json!({ "token": token, "new_password": NEW_PASSWORD }),
        )
        .await;
    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["details"]["field"], "token");

    client.cleanup(&email).await;
    client.purge_user(user_id).await;
}

#[tokio::test]
async fn revoke_all_sessions_ends_every_session() {
    let client = TestClient::new().await;
    let email = unique_email();

    let registered = client
        .post("/api/v1/auth/register", register_body(&email))
        .await;
    let first_cookie = registered.session_cookie().expect("registration cookie");

    let login = client
        .post(
            "/api/v1/auth/login",
            json!({ "email": email, "password": PASSWORD }),
        )
        .await;
    let second_cookie = login.session_cookie().expect("login cookie");

    let response = client
        .post_with_cookie("/api/v1/me/sessions/revoke-all", json!({}), &first_cookie)
        .await;
    assert_eq!(response.status, 204, "body: {}", response.body);

    // Both sessions are gone, including the one that made the request.
    assert_eq!(
        client.get("/api/v1/me", Some(&first_cookie)).await.status,
        401
    );
    assert_eq!(
        client.get("/api/v1/me", Some(&second_cookie)).await.status,
        401
    );

    client.cleanup(&email).await;
}
