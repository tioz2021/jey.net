//! Reading and updating the current user's profile.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::users::user::{UserRow, UserView, validate_display_name, validate_locale};

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub locale: Option<String>,
    pub is_public: Option<bool>,
}

/// `GET /api/v1/me`
pub async fn me(current: CurrentUser) -> Json<Value> {
    Json(json!({ "user": current.user }))
}

/// `PATCH /api/v1/me`
pub async fn update_me(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<UpdateProfileRequest>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    if payload.display_name.is_none() && payload.locale.is_none() && payload.is_public.is_none() {
        return Err(AppError::validation("at least one field must be provided"));
    }

    let display_name = match payload.display_name.as_deref() {
        Some(value) => Some(validate_display_name(value)?),
        None => None,
    };
    if let Some(locale) = payload.locale.as_deref() {
        validate_locale(locale)?;
    }

    let row = sqlx::query_as::<_, UserRow>(
        "update users set
             display_name = coalesce($1, display_name),
             locale = coalesce($2, locale),
             is_public = coalesce($3, is_public)
         where id = $4 and deleted_at is null
         returning id, email::text as email, display_name, locale,
                   email_verified_at, is_public, avatar_key, created_at, password_hash",
    )
    .bind(display_name)
    .bind(payload.locale)
    .bind(payload.is_public)
    .bind(current.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("user"))?;

    Ok(Json(json!({ "user": UserView::from(row) })))
}
