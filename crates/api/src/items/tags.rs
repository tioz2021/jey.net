//! Tags: listing with usage counts and deleting.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TagCount {
    pub id: Uuid,
    pub name: String,
    /// Number of live records carrying this tag.
    pub item_count: i64,
}

/// `GET /api/v1/tags`
pub async fn list_tags(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let tags = count_tags(&state.pool, current.user.id).await?;

    Ok(Json(json!({ "tags": tags })))
}

/// `DELETE /api/v1/tags/{id}`
pub async fn delete_tag(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = parse_id(&raw_id)?;

    let deleted = delete(&state.pool, current.user.id, id).await?;
    if !deleted {
        return Err(AppError::not_found("tag not found"));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn count_tags(pool: &PgPool, user_id: Uuid) -> Result<Vec<TagCount>, AppError> {
    sqlx::query_as::<_, TagCount>(
        "select t.id, t.name, count(i.id)::bigint as item_count
         from tags t
         left join item_tags it on it.tag_id = t.id
         left join items i on i.id = it.item_id and i.deleted_at is null
         where t.user_id = $1
         group by t.id
         order by lower(t.name)",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)
}

/// Removes the tag; links disappear, records stay.
async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<bool, AppError> {
    let result = sqlx::query("delete from tags where id = $1 and user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;

    Ok(result.rows_affected() > 0)
}
