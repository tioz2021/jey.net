//! Logout: drops the current session and clears the cookie.
//!
//! The endpoint is intentionally idempotent: calling it twice, or with an
//! already invalid cookie, is not an error for the client.

use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};

use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;

/// `POST /api/v1/auth/logout`
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    session::revoke_by_cookie(&state.pool, &headers).await?;

    let cookie = session::cleared_session_cookie(state.config.is_production());

    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );

    Ok(response)
}

/// `POST /api/v1/me/sessions/revoke-all`
///
/// Ends every session of the account, including the current one: the person is
/// asked to log in again. Used after a password leak or on a shared device.
pub async fn revoke_all_sessions(
    State(state): State<AppState>,
    current: crate::auth::middleware::CurrentUser,
) -> Result<Response, AppError> {
    sqlx::query("delete from sessions where user_id = $1")
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;

    let cookie = session::cleared_session_cookie(state.config.is_production());

    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );

    Ok(response)
}
