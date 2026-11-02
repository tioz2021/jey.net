//! Logout: drops the current session and clears the cookie.
//!
//! The endpoint is intentionally idempotent: calling it twice, or with an
//! already invalid cookie, is not an error for the client.

use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};

use crate::AppState;
use crate::auth::session;
use crate::error::AppError;

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
