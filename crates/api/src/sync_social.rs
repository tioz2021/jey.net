//! `GET /api/v1/sync/social` — collections and own comments for desktop sync.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

pub async fn social(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let collections: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', c.id, 'title', c.title, 'slug', c.slug, 'visibility', c.visibility,
            'created_at', (extract(epoch from c.created_at) * 1000)::bigint
         )
         from collections c where c.user_id = $1 order by c.created_at asc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let comments: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', c.id, 'item_id', c.item_id, 'parent_id', c.parent_id,
            'body', c.body, 'user_id', c.user_id,
            'created_at', (extract(epoch from c.created_at) * 1000)::bigint,
            'deleted_at', case when c.deleted_at is null then null
              else (extract(epoch from c.deleted_at) * 1000)::bigint end
         )
         from comments c where c.user_id = $1 order by c.created_at asc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let profile: Option<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'display_name', u.display_name, 'handle', u.handle, 'locale', u.locale,
            'is_public', u.is_public, 'public_statuses', u.public_statuses,
            'public_show_progress', u.public_show_progress
         ) from users u where u.id = $1",
    )
    .bind(current.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let reactions: Vec<uuid::Uuid> =
        sqlx::query_scalar("select comment_id from comment_reactions where user_id = $1")
            .bind(current.user.id)
            .fetch_all(&state.pool)
            .await
            .map_err(AppError::internal)?;

    Ok(Json(json!({
        "collections": collections, "comments": comments, "profile": profile,
        "reactions": reactions,
    })))
}
