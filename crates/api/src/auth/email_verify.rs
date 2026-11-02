//! Email confirmation: send the letter, accept the token, allow a resend.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use serde::Deserialize;

use crate::auth::middleware::CurrentUser;
use crate::auth::tokens::{self, EMAIL_VERIFICATION_TTL, Purpose};
use crate::error::AppError;
use crate::http::AppState;
use crate::http::ratelimit;
use crate::mail::templates;

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

/// `POST /api/v1/auth/verify-email`
pub async fn verify_email(
    State(state): State<AppState>,
    payload: Result<Json<VerifyEmailRequest>, JsonRejection>,
) -> Result<StatusCode, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let user_id = tokens::consume(&state.pool, &payload.token, Purpose::EmailVerification).await?;

    sqlx::query("update users set email_verified_at = now() where id = $1 and deleted_at is null")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;

    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/v1/auth/verify-email/resend`
pub async fn resend_verification(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<StatusCode, AppError> {
    if current.user.email_verified {
        return Err(AppError::validation("email is already verified"));
    }

    ratelimit::enforce(
        &state.pool,
        ratelimit::VERIFY_RESEND,
        &format!("verify-resend:{}", current.user.id),
    )
    .await?;

    send_verification(&state, current.user.id, &current.user.email)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "failed to send verification email");
            AppError::internal(err)
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Issues a token and sends the letter. Errors are logged by the caller.
pub async fn send_verification(
    state: &AppState,
    user_id: uuid::Uuid,
    email: &str,
) -> Result<(), AppError> {
    let issued = tokens::issue(
        &state.pool,
        user_id,
        Purpose::EmailVerification,
        EMAIL_VERIFICATION_TTL,
    )
    .await?;

    let message = templates::email_verification(&state.config.public_url, email, &issued.token);

    state
        .mailer
        .send(message)
        .await
        .map_err(AppError::internal)?;

    Ok(())
}
