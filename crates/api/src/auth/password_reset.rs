//! Password reset by email.
//!
//! Requesting a reset always answers `202`, whether the address exists or not;
//! otherwise the endpoint would become a way to enumerate accounts.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::normalise_email;
use crate::auth::password::{self, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordError};
use crate::auth::tokens::{self, PASSWORD_RESET_TTL, Purpose};
use crate::error::AppError;
use crate::http::AppState;
use crate::http::ratelimit;
use crate::mail::templates;
use crate::users::user;

#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetConfirm {
    pub token: String,
    pub new_password: String,
}

/// `POST /api/v1/auth/password-reset/request`
pub async fn request_reset(
    State(state): State<AppState>,
    payload: Result<Json<ResetRequest>, JsonRejection>,
) -> Result<StatusCode, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let email = normalise_email(&payload.email);

    // The limit is keyed by address and applies before the lookup, so existing
    // and unknown addresses behave the same.
    ratelimit::enforce(
        &state.pool,
        ratelimit::PASSWORD_RESET_REQUEST,
        &format!("pwreset:{email}"),
    )
    .await?;

    if let Some(record) = user::find_by_email(&state.pool, &email).await? {
        if let Err(err) = send_reset(&state, record.id, &email).await {
            tracing::warn!(error = %err, "failed to send the password reset email");
        }
    }

    Ok(StatusCode::ACCEPTED)
}

/// `POST /api/v1/auth/password-reset/confirm`
pub async fn confirm_reset(
    State(state): State<AppState>,
    payload: Result<Json<ResetConfirm>, JsonRejection>,
) -> Result<StatusCode, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    // Validate the new password before burning the token: a typo in the
    // password should not force the user to request another letter.
    let new_hash = password::hash_password(&payload.new_password).map_err(|err| match err {
        PasswordError::InvalidLength => AppError::validation_field(
            "new_password",
            format!(
                "password must be between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters"
            ),
        ),
        _ => AppError::internal(err),
    })?;

    let user_id = tokens::consume(&state.pool, &payload.token, Purpose::PasswordReset).await?;

    let mut transaction = state.pool.begin().await.map_err(AppError::internal)?;

    sqlx::query("update users set password_hash = $1 where id = $2 and deleted_at is null")
        .bind(&new_hash)
        .bind(user_id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    // Whoever knew the old password is logged out everywhere.
    sqlx::query("delete from sessions where user_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    transaction.commit().await.map_err(AppError::internal)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn send_reset(state: &AppState, user_id: Uuid, email: &str) -> Result<(), AppError> {
    let issued = tokens::issue(
        &state.pool,
        user_id,
        Purpose::PasswordReset,
        PASSWORD_RESET_TTL,
    )
    .await?;

    let message = templates::password_reset(&state.config.public_url, email, &issued.token);

    state
        .mailer
        .send(message)
        .await
        .map_err(AppError::internal)?;

    Ok(())
}
