//! In-app notifications: currently new followers.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

/// `GET /api/v1/notifications`
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let items: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', n.id,
            'kind', n.kind,
            'actor_id', u.id,
            'actor_name', u.display_name,
            'actor_avatar', u.avatar_key,
            'created_at', n.created_at,
            'read', n.read_at is not null
         )
         from notifications n
         join users u on u.id = n.actor_id
         where n.user_id = $1
           and u.deleted_at is null
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = n.actor_id)
                  or (b.blocker_id = n.actor_id and b.blocked_id = $1)
           )
         order by n.created_at desc
         limit 100",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let unread: i64 = sqlx::query_scalar(
        "select count(*) from notifications where user_id = $1 and read_at is null",
    )
    .bind(current.user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "items": items, "unread": unread })))
}

/// `POST /api/v1/notifications/read`
pub async fn mark_all_read(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    sqlx::query("update notifications set read_at = now() where user_id = $1 and read_at is null")
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "unread": 0 })))
}

/// `POST /api/v1/notifications/{id}/read`
pub async fn mark_read(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update notifications set read_at = coalesce(read_at, now())
         where id = $1 and user_id = $2",
    )
    .bind(id)
    .bind(current.user.id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("notification"));
    }
    Ok(Json(json!({ "ok": true })))
}
