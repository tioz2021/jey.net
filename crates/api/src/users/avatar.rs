//! Profile avatars: a square 128 px WebP cut from an uploaded image.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::media::transform;
use crate::users::user::{self, UserView};

#[derive(Debug, Deserialize)]
pub struct AvatarInput {
    pub upload_id: Uuid,
}

/// `POST /api/v1/me/avatar`
pub async fn set_avatar(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<AvatarInput>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let original_key = sqlx::query_scalar::<_, String>(
        "select storage_key from uploads where id = $1 and user_id = $2",
    )
    .bind(payload.upload_id)
    .bind(current.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("upload not found"))?;

    let original = state
        .storage
        .get(&original_key)
        .await?
        .ok_or_else(|| AppError::not_found("upload file not found"))?;

    let bytes = transform::avatar(&original)?;
    let key = format!("u/{}/avatar/{}.webp", current.user.id, Uuid::new_v4());
    state.storage.put(&key, &bytes).await?;

    sqlx::query("update users set avatar_key = $2 where id = $1")
        .bind(current.user.id)
        .bind(&key)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;

    // The previous picture is no longer referenced.
    if let Some(previous) = current.user.avatar_key.as_deref()
        && previous != key
    {
        let _ = state.storage.delete(previous).await;
    }

    read_user(&state, current.user.id).await
}

/// `DELETE /api/v1/me/avatar`
pub async fn clear_avatar(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    sqlx::query("update users set avatar_key = null where id = $1")
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;

    if let Some(previous) = current.user.avatar_key.as_deref() {
        let _ = state.storage.delete(previous).await;
    }

    read_user(&state, current.user.id).await
}

async fn read_user(state: &AppState, user_id: Uuid) -> Result<Json<Value>, AppError> {
    let row = user::find_by_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    Ok(Json(json!({ "user": UserView::from(row) })))
}
