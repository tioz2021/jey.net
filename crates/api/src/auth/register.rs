//! Registration: creates an account and signs the user in right away.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::http::header::{SET_COOKIE, USER_AGENT};
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::AppState;
use crate::auth::normalise_email;
use crate::auth::password::{self, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordError};
use crate::auth::session;
use crate::auth::user;
use crate::error::AppError;

/// Longest accepted email address, per RFC 5321.
const MAX_EMAIL_LENGTH: usize = 254;
/// Longest accepted display name.
const MAX_DISPLAY_NAME_LENGTH: usize = 60;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

/// `POST /api/v1/auth/register`
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<RegisterRequest>, JsonRejection>,
) -> Result<Response, AppError> {
    // A broken body must still use the API error format, not axum's plain text.
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let email = normalise_email(&payload.email);
    validate_email(&email)?;

    let display_name = payload.display_name.trim().to_owned();
    validate_display_name(&display_name)?;

    let password_hash = password::hash_password(&payload.password).map_err(|err| match err {
        PasswordError::InvalidLength => AppError::validation_field(
            "password",
            format!(
                "password must be between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters"
            ),
        ),
        _ => AppError::internal(err),
    })?;

    let user = user::create(&state.pool, &email, &password_hash, &display_name).await?;

    let user_agent = headers
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok());

    let created = session::create_session(
        &state.pool,
        user.id,
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

    let mut response = (StatusCode::CREATED, Json(json!({ "user": user }))).into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );

    Ok(response)
}

fn validate_email(email: &str) -> Result<(), AppError> {
    let invalid = |message: &str| AppError::validation_field("email", message);

    if email.is_empty() {
        return Err(invalid("email is required"));
    }
    if email.len() > MAX_EMAIL_LENGTH {
        return Err(invalid("email is too long"));
    }

    let mut parts = email.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return Err(invalid("email must contain a single @"));
    };

    if local.is_empty() || local.len() > 64 {
        return Err(invalid("email local part is invalid"));
    }
    if domain.is_empty()
        || !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
    {
        return Err(invalid("email domain is invalid"));
    }
    if email.chars().any(char::is_whitespace) {
        return Err(invalid("email must not contain spaces"));
    }

    Ok(())
}

fn validate_display_name(display_name: &str) -> Result<(), AppError> {
    let length = display_name.chars().count();

    if !(1..=MAX_DISPLAY_NAME_LENGTH).contains(&length) {
        return Err(AppError::validation_field(
            "display_name",
            format!("display name must be between 1 and {MAX_DISPLAY_NAME_LENGTH} characters"),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_emails_pass() {
        for email in ["a@b.co", "first.last@example.com", "user+tag@example.org"] {
            assert!(validate_email(email).is_ok(), "{email} should be valid");
        }
    }

    #[test]
    fn invalid_emails_are_rejected() {
        for email in [
            "",
            "no-at-sign",
            "two@@example.com",
            "a@b",
            "a b@example.com",
        ] {
            assert!(validate_email(email).is_err(), "{email} should be rejected");
        }
    }

    #[test]
    fn display_name_bounds() {
        assert!(validate_display_name("Jey").is_ok());
        assert!(validate_display_name(&"a".repeat(60)).is_ok());
        assert!(validate_display_name("").is_err());
        assert!(validate_display_name(&"a".repeat(61)).is_err());
    }
}
