//! Public profile: what a stranger may see about an account.
//!
//! The profile is opt-in (`users.is_public`), shows only finished records and
//! never exposes anything private: no email, no notes, no sync internals.
//! A private or deleted account answers exactly like a missing one, so the
//! endpoint cannot be used to enumerate accounts.

use axum::Json;
use axum::extract::{Path, State};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::http::AppState;

/// How many finished records a profile shows.
const MAX_PUBLIC_ITEMS: i64 = 200;

#[derive(Debug, sqlx::FromRow)]
struct PublicUserRow {
    id: Uuid,
    display_name: String,
    avatar_key: Option<String>,
    banner_key: Option<String>,
    locale: String,
    created_at: DateTime<Utc>,
}

/// A finished record as the public sees it: no review, no source URL, no sync
/// fields.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicItemView {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub year: Option<i32>,
    pub rating: Option<i16>,
    pub review: Option<String>,
    pub cover_key: Option<String>,
    pub tags: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

/// One public record page: unlike the listing it includes the author's note,
/// because sharing the impression is the point of a public record.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicItemDetail {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub year: Option<i32>,
    pub rating: Option<i16>,
    pub review: Option<String>,
    pub cover_key: Option<String>,
    pub external_source: Option<String>,
    pub external_id: Option<String>,
    pub details: Option<Value>,
    pub tags: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

/// One public profile in the sitemap listing.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicUserEntry {
    pub id: Uuid,
    pub display_name: String,
}

/// `GET /api/v1/public/users`
///
/// Public, opt-in profiles only — enough for a sitemap, nothing private.
pub async fn list(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let users = sqlx::query_as::<_, PublicUserEntry>(
        "select id, display_name
         from users
         where is_public and deleted_at is null
         order by created_at desc
         limit 1000",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok(Json(json!({ "users": users })))
}

/// `GET /api/v1/public/users/{id}`
pub async fn profile(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let user = load_public_user(&state.pool, id).await?;
    let items = load_public_items(&state.pool, id).await?;

    Ok(Json(json!({
        "profile": {
            "id": user.id,
            "display_name": user.display_name,
            "avatar_key": user.avatar_key,
            "banner_key": user.banner_key,
            "locale": user.locale,
            "created_at": user.created_at,
        },
        "items": items,
    })))
}

async fn load_public_user(pool: &PgPool, id: Uuid) -> Result<PublicUserRow, AppError> {
    sqlx::query_as::<_, PublicUserRow>(
        "select id, display_name, avatar_key, banner_key, locale, created_at
         from users
         where id = $1 and is_public and deleted_at is null",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("profile"))
}

/// `GET /api/v1/public/users/{id}/items/{item_id}`
///
/// One finished record of a public profile; anything else answers `404`.
pub async fn item(
    State(state): State<AppState>,
    Path((user_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, AppError> {
    load_public_user(&state.pool, user_id).await?;

    let item = sqlx::query_as::<_, PublicItemDetail>(
        "select i.id,
                i.kind,
                i.title,
                i.subtitle,
                i.year,
                i.rating,
                i.review,
                i.cover_key,
                i.external_source,
                i.external_id,
                i.details,
                i.updated_at,
                coalesce(
                    array_agg(t.name order by lower(t.name)) filter (where t.name is not null),
                    '{}'
                ) as tags
         from items i
         left join item_tags it on it.item_id = i.id
         left join tags t on t.id = it.tag_id
         where i.id = $2
           and i.user_id = $1
           and i.status = 'done'
           and i.deleted_at is null
         group by i.id",
    )
    .bind(user_id)
    .bind(item_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("record"))?;

    Ok(Json(json!({ "item": item })))
}

async fn load_public_items(pool: &PgPool, user_id: Uuid) -> Result<Vec<PublicItemView>, AppError> {
    sqlx::query_as::<_, PublicItemView>(
        "select i.id,
                i.kind,
                i.title,
                i.subtitle,
                i.year,
                i.rating,
                i.review,
                i.cover_key,
                i.external_source,
                i.external_id,
                i.details,
                i.updated_at,
                coalesce(
                    array_agg(t.name order by lower(t.name)) filter (where t.name is not null),
                    '{}'
                ) as tags
         from items i
         left join item_tags it on it.item_id = i.id
         left join tags t on t.id = it.tag_id
         where i.user_id = $1
           and i.status = 'done'
           and i.deleted_at is null
         group by i.id
         order by i.updated_at desc
         limit $2",
    )
    .bind(user_id)
    .bind(MAX_PUBLIC_ITEMS)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)
}
