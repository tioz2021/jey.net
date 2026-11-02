//! Account deletion: anonymises the account and kills every session.
//!
//! Records are kept for now (they are marked with the account's `deleted_at`
//! later); a purge task will remove them for good after the MVP.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use crate::auth::middleware::CurrentUser;
use crate::auth::password;
use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;
use crate::users::user;

#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: String,
}

/// `DELETE /api/v1/me`
pub async fn delete_me(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<DeleteAccountRequest>, JsonRejection>,
) -> Result<Response, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    if payload.password.is_empty() {
        return Err(AppError::validation_field(
            "password",
            "password is required to delete the account",
        ));
    }

    let record = user::find_by_id(&state.pool, current.user.id)
        .await?
        .ok_or_else(|| AppError::unauthorized("authentication required"))?;

    match password::verify_password(&payload.password, &record.password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return Err(AppError::validation_field(
                "password",
                "password is incorrect",
            ));
        }
        Err(err) => return Err(AppError::internal(err)),
    }

    let mut transaction = state.pool.begin().await.map_err(AppError::internal)?;

    // Sessions and devices belong to the person, not to the data: drop them.
    sqlx::query("delete from sessions where user_id = $1")
        .bind(record.id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    sqlx::query("delete from devices where user_id = $1")
        .bind(record.id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

    // Anonymise: the address becomes free for a new registration, the profile
    // stops revealing who it belonged to.
    let anonymised_email = format!("deleted-{}@invalid", record.id);

    sqlx::query(
        "update users set
             deleted_at = now(),
             email = $2,
             display_name = 'Deleted user',
             is_public = false,
             email_verified_at = null
         where id = $1",
    )
    .bind(record.id)
    .bind(anonymised_email)
    .execute(&mut *transaction)
    .await
    .map_err(AppError::internal)?;

    transaction.commit().await.map_err(AppError::internal)?;

    let cookie = session::cleared_session_cookie(state.config.is_production());
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );

    Ok(response)
}
