//! Changing a password: proves ownership, rotates the hash, drops other sessions.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use serde::Deserialize;

use crate::auth::middleware::CurrentUser;
use crate::auth::password::{self, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordError};
use crate::error::AppError;
use crate::http::AppState;
use crate::users::user;

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// `POST /api/v1/me/password`
pub async fn change_password(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<ChangePasswordRequest>, JsonRejection>,
) -> Result<StatusCode, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let record = user::find_by_id(&state.pool, current.user.id)
        .await?
        .ok_or_else(|| AppError::unauthorized("authentication required"))?;

    match password::verify_password(&payload.current_password, &record.password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return Err(AppError::validation_field(
                "current_password",
                "current password is incorrect",
            ));
        }
        Err(err) => return Err(AppError::internal(err)),
    }

    // Reusing the old password is almost always a mistake, so refuse it.
    if matches!(
        password::verify_password(&payload.new_password, &record.password_hash),
        Ok(true)
    ) {
        return Err(AppError::validation_field(
            "new_password",
            "new password must differ from the current one",
        ));
    }

    let new_hash = password::hash_password(&payload.new_password).map_err(|err| match err {
        PasswordError::InvalidLength => AppError::validation_field(
            "new_password",
            format!(
                "password must be between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters"
            ),
        ),
        _ => AppError::internal(err),
    })?;

    let mut transaction = state.pool.begin().await.map_err(AppError::internal)?;

    sqlx::query("update users set password_hash = $1 where id = $2")
        .bind(&new_hash)
        .bind(record.id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    // Keep the caller signed in, sign everyone else out.
    sqlx::query("delete from sessions where user_id = $1 and id <> $2")
        .bind(record.id)
        .bind(current.session_id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    transaction.commit().await.map_err(AppError::internal)?;

    Ok(StatusCode::NO_CONTENT)
}
