//! One like per person on a public record.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

async fn ensure_public_item(pool: &sqlx::PgPool, item_id: Uuid) -> Result<(), AppError> {
    let visible: Option<Uuid> = sqlx::query_scalar(
        "select i.id from items i join users u on u.id = i.user_id
         where i.id = $1 and i.deleted_at is null and not i.public_hidden
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    visible
        .ok_or_else(|| AppError::not_found("record"))
        .map(|_| ())
}

/// `GET /api/v1/public/items/{id}/reactions`
pub async fn list(
    State(state): State<AppState>,
    Path(item_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ensure_public_item(&state.pool, item_id).await?;
    let likers: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', u.id,
            'name', u.display_name,
            'avatar', u.avatar_key
         )
         from reactions r join users u on u.id = r.user_id
         where r.item_id = $1 and u.deleted_at is null
         order by r.created_at desc
         limit 100",
    )
    .bind(item_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let count = likers.len() as i64;
    Ok(Json(json!({ "count": count, "likers": likers })))
}

/// `POST /api/v1/public/items/{id}/reactions` — toggle the current like.
pub async fn toggle(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(item_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ensure_public_item(&state.pool, item_id).await?;
    let removed = sqlx::query("delete from reactions where user_id = $1 and item_id = $2")
        .bind(current.user.id)
        .bind(item_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?
        .rows_affected()
        > 0;
    if !removed {
        sqlx::query(
            "insert into reactions (user_id, item_id) values ($1, $2) on conflict do nothing",
        )
        .bind(current.user.id)
        .bind(item_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    }
    let count: i64 = sqlx::query_scalar("select count(*) from reactions where item_id = $1")
        .bind(item_id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "reacted": !removed, "count": count })))
}
