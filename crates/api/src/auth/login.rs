//! Login: verifies credentials and opens a session.

use std::sync::OnceLock;

use std::net::SocketAddr;

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::http::header::{SET_COOKIE, USER_AGENT};
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::normalise_email;
use crate::auth::password;
use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;
use crate::http::ratelimit;
use crate::users::user::{self, UserView};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// `POST /api/v1/auth/login`
pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    payload: Result<Json<LoginRequest>, JsonRejection>,
) -> Result<Response, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let email = normalise_email(&payload.email);

    let ip = ratelimit::client_ip(&headers, peer);
    ratelimit::enforce(
        &state.pool,
        ratelimit::LOGIN,
        &format!("login:{ip}:{email}"),
    )
    .await?;

    let Some(record) = user::find_by_email(&state.pool, &email).await? else {
        // Spend roughly the same time as a real verification so the response
        // does not reveal whether the address exists.
        let _ = password::verify_password(&payload.password, dummy_hash());
        return Err(invalid_credentials());
    };

    let Some(hash) = record.password_hash.as_deref() else {
        return Err(invalid_credentials());
    };

    match password::verify_password(&payload.password, hash) {
        Ok(true) => {}
        Ok(false) => return Err(invalid_credentials()),
        Err(err) => return Err(AppError::internal(err)),
    }

    let user_agent = headers
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok());

    let created = session::create_session(
        &state.pool,
        record.id,
        None,
        state.config.session_ttl_days,
        user_agent,
    )
    .await
    .map_err(AppError::internal)?;

    let cookie = session::session_cookie(
        &created.token,
        state.config.session_ttl_days,
        state.config.is_production(),
    );

    let view = UserView::from(record);

    let mut response = (StatusCode::OK, Json(json!({ "user": view }))).into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );

    Ok(response)
}

/// The same answer for an unknown address and a wrong password.
fn invalid_credentials() -> AppError {
    AppError::unauthorized("invalid email or password")
}

/// Computes the timing placeholder once, before the server accepts requests.
///
/// Without this the first unknown-email login would pay for both hashing and
/// verification, which is visible in the response time.
pub fn warm_up() {
    let started = std::time::Instant::now();
    let _ = dummy_hash();
    tracing::debug!(elapsed = ?started.elapsed(), "login timing placeholder ready");
}

/// A valid hash with the production parameters, used only for timing.
fn dummy_hash() -> &'static str {
    static DUMMY: OnceLock<String> = OnceLock::new();

    DUMMY.get_or_init(|| {
        password::hash_password("timing-only-placeholder")
            .unwrap_or_else(|_| String::from("$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dummy_hash_looks_like_argon2id() {
        assert!(dummy_hash().starts_with("$argon2id$"));
    }

    #[test]
    fn invalid_credentials_are_not_specific() {
        let error = invalid_credentials();
        let text = error.to_string();

        assert!(text.contains("invalid email or password"));
        assert!(!text.contains("user not found"));
        assert!(!text.contains("wrong password"));
    }
}
