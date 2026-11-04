//! Public profile: what a stranger may see about an account.
//!
//! The profile is opt-in (`users.is_public`), shows only finished records and
//! never exposes anything private: no email, no notes, no sync internals.
//! A private or deleted account answers exactly like a missing one, so the
//! endpoint cannot be used to enumerate accounts.

use axum::Json;
use axum::extract::{Path, State};
use chrono::{DateTime, Utc};
use jey_core::items::MovieDetails;
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
    public_statuses: Vec<String>,
    public_show_progress: bool,
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
    pub status: String,
    pub rating: Option<i16>,
    pub review: Option<String>,
    pub cover_key: Option<String>,
    pub titles: Option<sqlx::types::Json<std::collections::BTreeMap<String, String>>>,
    pub directors: Option<sqlx::types::Json<std::collections::BTreeMap<String, String>>>,
    pub genres: Option<sqlx::types::Json<std::collections::BTreeMap<String, Vec<String>>>>,
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
    pub status: String,
    pub rating: Option<i16>,
    pub review: Option<String>,
    pub cover_key: Option<String>,
    pub external_source: Option<String>,
    pub external_id: Option<String>,
    pub details: Option<sqlx::types::Json<MovieDetails>>,
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
    let items = load_public_items(&state.pool, id, &user.public_statuses).await?;

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
        "select id, display_name, avatar_key, banner_key, locale,
                public_statuses, public_show_progress, created_at
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
    let user = load_public_user(&state.pool, user_id).await?;

    let item = sqlx::query_as::<_, PublicItemDetail>(
        "select i.id,
                i.kind,
                i.title,
                i.subtitle,
                i.year,
                i.status,
                i.rating,
                i.review,
                i.cover_key,
                i.external_source,
                i.external_id,
                i.details,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->>'title')
                        from jsonb_each(i.details->'translations')
                        where value ? 'title'
                    ),
                    '{}'::jsonb
                ) as titles,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->>'director')
                        from jsonb_each(i.details->'translations')
                        where value ? 'director'
                    ),
                    '{}'::jsonb
                ) as directors,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->'genres')
                        from jsonb_each(i.details->'translations')
                        where value ? 'genres'
                    ),
                    '{}'::jsonb
                ) as genres,
                i.updated_at,
                coalesce(
                    array_agg(t.name order by lower(t.name)) filter (where t.name is not null),
                    '{}'
         from items i
         where i.id = $2
           and i.user_id = $1
           and i.status = ANY($3)
           and not i.public_hidden
           and i.deleted_at is null
         group by i.id",
    )
    .bind(user_id)
    .bind(item_id)
    .bind(&user.public_statuses)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("record"))?;

    Ok(Json(json!({
        "item": item,
        "progress_visible": user.public_show_progress,
    })))
}

/// `GET /api/v1/public/users/{id}/items/{item_id}/episodes?season=N`
///
/// Read-only episode progress for a public series. The direct link must pass
/// the same status/hidden checks as the record page.
pub async fn episodes(
    State(state): State<AppState>,
    Path((user_id, item_id)): Path<(Uuid, Uuid)>,
    axum::extract::Query(query): axum::extract::Query<crate::items::episodes::SeasonQuery>,
) -> Result<Json<Value>, AppError> {
    let user = load_public_user(&state.pool, user_id).await?;
    if !user.public_show_progress {
        return Err(AppError::not_found("record"));
    }

    let row = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            Option<String>,
            Option<sqlx::types::Json<MovieDetails>>,
        ),
    >(
        "select i.kind, i.external_source, i.external_id, i.details
         from items i
         where i.id = $2
           and i.user_id = $1
           and i.status = ANY($3)
           and not i.public_hidden
           and i.deleted_at is null",
    )
    .bind(user_id)
    .bind(item_id)
    .bind(&user.public_statuses)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("record"))?;

    if row.0 != "tv" || row.1.as_deref() != Some("tmdb") {
        return Err(AppError::not_found("record"));
    }
    if !state.tmdb.configured() {
        return Err(AppError::unavailable("TMDB is not configured"));
    }

    let external_id: u64 = row
        .2
        .as_deref()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| AppError::not_found("record"))?;
    let season_number = query.season.unwrap_or(1);
    if !(0..=100).contains(&season_number) {
        return Err(AppError::validation_field("season", "invalid season"));
    }

    let season = state
        .tmdb
        .season(
            external_id,
            season_number,
            crate::movies::language_for(&user.locale),
        )
        .await?;

    let watched: std::collections::BTreeSet<(i32, i32)> = row
        .3
        .as_ref()
        .map(|details| {
            details
                .0
                .watched_episodes
                .iter()
                .map(|episode| (episode.season_number, episode.episode_number))
                .collect()
        })
        .unwrap_or_default();

    let episodes: Vec<Value> = season
        .episodes
        .iter()
        .map(|episode| {
            json!({
                "episode_number": episode.episode_number,
                "name": episode.name,
                "overview": episode.overview,
                "air_date": episode.air_date,
                "runtime": episode.runtime,
                "still_path": episode.still_path,
                "watched": watched.contains(&(season_number, episode.episode_number)),
            })
        })
        .collect();

    Ok(Json(json!({
        "season": {
            "season_number": season.season_number,
            "name": season.name,
        },
        "episodes": episodes,
    })))
}

async fn load_public_items(
    pool: &PgPool,
    user_id: Uuid,
    statuses: &[String],
) -> Result<Vec<PublicItemView>, AppError> {
    sqlx::query_as::<_, PublicItemView>(
        "select i.id,
                i.kind,
                i.title,
                i.subtitle,
                i.year,
                i.status,
                i.rating,
                i.review,
                i.cover_key,
                i.external_source,
                i.external_id,
                i.details,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->>'title')
                        from jsonb_each(i.details->'translations')
                        where value ? 'title'
                    ),
                    '{}'::jsonb
                ) as titles,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->>'director')
                        from jsonb_each(i.details->'translations')
                        where value ? 'director'
                    ),
                    '{}'::jsonb
                ) as directors,
                coalesce(
                    (
                        select jsonb_object_agg(key, value->'genres')
                        from jsonb_each(i.details->'translations')
                        where value ? 'genres'
                    ),
                    '{}'::jsonb
                ) as genres,
                i.updated_at,
                coalesce(
                    array_agg(t.name order by lower(t.name)) filter (where t.name is not null),
                    '{}'
         from items i
         where i.user_id = $1
           and i.status = ANY($2)
           and not i.public_hidden
           and i.deleted_at is null
         group by i.id
         order by i.updated_at desc
         limit $3",
    )
    .bind(user_id)
    .bind(statuses)
    .bind(MAX_PUBLIC_ITEMS)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)
}
