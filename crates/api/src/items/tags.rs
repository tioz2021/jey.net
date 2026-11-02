//! Tags: listing with usage counts, renaming, merging and deleting.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Deserialize)]
pub struct RenameTag {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct MergeTag {
    pub into_id: Uuid,
}

/// `PATCH /api/v1/tags/{id}`
///
/// Renames a tag in place; the name stays unique per user, case-insensitively.
pub async fn rename_tag(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
    Json(body): Json<RenameTag>,
) -> Result<Json<Value>, AppError> {
    let id = parse_id(&raw_id)?;
    let name = body.name.trim();

    if name.is_empty() {
        return Err(AppError::validation_field("name", "tag must not be empty"));
    }
    if name.chars().count() > 40 {
        return Err(AppError::validation_field(
            "name",
            "tag must be at most 40 characters",
        ));
    }

    let updated = sqlx::query_as::<_, TagCount>(
        "update tags set name = $3
         where id = $1 and user_id = $2
         returning id, name, 0::bigint as item_count",
    )
    .bind(id)
    .bind(current.user.id)
    .bind(name)
    .fetch_optional(&state.pool)
    .await;

    match updated {
        Ok(Some(tag)) => Ok(Json(json!({ "tag": tag }))),
        Ok(None) => Err(AppError::not_found("tag not found")),
        Err(error) if is_unique_violation(&error) => {
            Err(AppError::conflict("a tag with this name already exists"))
        }
        Err(error) => Err(AppError::internal(error)),
    }
}

/// `POST /api/v1/tags/{id}/merge`
///
/// Moves every record from one tag to another and removes the source tag.
pub async fn merge_tag(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
    Json(body): Json<MergeTag>,
) -> Result<Json<Value>, AppError> {
    let source = parse_id(&raw_id)?;
    if source == body.into_id {
        return Err(AppError::validation_field(
            "into_id",
            "a tag cannot be merged into itself",
        ));
    }

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;

    let target_exists =
        sqlx::query_scalar::<_, Uuid>("select id from tags where id = $1 and user_id = $2")
            .bind(body.into_id)
            .bind(current.user.id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(AppError::internal)?;

    if target_exists.is_none() {
        return Err(AppError::not_found("tag not found"));
    }

    let source_exists =
        sqlx::query_scalar::<_, Uuid>("select id from tags where id = $1 and user_id = $2")
            .bind(source)
            .bind(current.user.id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(AppError::internal)?;

    if source_exists.is_none() {
        return Err(AppError::not_found("tag not found"));
    }

    sqlx::query(
        "insert into item_tags (item_id, tag_id)
         select item_id, $2 from item_tags where tag_id = $1
         on conflict do nothing",
    )
    .bind(source)
    .bind(body.into_id)
    .execute(&mut *tx)
    .await
    .map_err(AppError::internal)?;

    sqlx::query("delete from item_tags where tag_id = $1")
        .bind(source)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;

    sqlx::query("delete from tags where id = $1 and user_id = $2")
        .bind(source)
        .bind(current.user.id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;

    tx.commit().await.map_err(AppError::internal)?;

    Ok(Json(json!({ "merged_into": body.into_id })))
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
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
