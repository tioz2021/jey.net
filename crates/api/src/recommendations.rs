//! Recommendations from public ratings of followed profiles.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

/// `GET /api/v1/items/{id}/similar` — provider suggestions for one record.
pub async fn similar(
    State(state): State<AppState>,
    current: CurrentUser,
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
) -> Result<Json<Value>, AppError> {
    let row: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "select kind, external_source, external_id from items
         where id = $1 and user_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(current.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let (kind, source, external_id) = row.ok_or_else(|| AppError::not_found("record"))?;
    let Some(source) = source else {
        return Ok(Json(json!({ "items": [] })));
    };
    let Some(external_id) = external_id.and_then(|value| value.parse::<u64>().ok()) else {
        return Ok(Json(json!({ "items": [] })));
    };
    let items = match source.as_str() {
        "tmdb" => {
            let language = match current.user.locale.as_str() {
                "ru" => "ru-RU",
                "uk" => "uk-UA",
                _ => "en-US",
            };
            let media = if kind == "tv" { "tv" } else { "movie" };
            state.tmdb.similar(media, external_id, language).await?
        }
        "igdb" => state.igdb.similar(external_id).await?,
        "anilist" => crate::anime::anilist::similar(external_id).await?,
        "shikimori" => crate::anime::shikimori::similar(external_id).await?,
        _ => Vec::new(),
    };
    Ok(Json(json!({ "items": items })))
}

/// `GET /api/v1/recommendations/friends`
pub async fn friends(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let items: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', i.id,
            'author_id', (array_agg(u.id order by f.created_at desc))[1],
            'kind', i.kind,
            'title', i.title,
            'subtitle', i.subtitle,
            'year', i.year,
            'status', i.status,
            'rating', i.rating,
            'review', i.review,
            'cover_key', i.cover_key,
            'external_source', i.external_source,
            'external_id', i.external_id,
            'details', i.details,
            'updated_at', i.updated_at,
            'friends', jsonb_agg(distinct u.display_name),
            'friend_count', count(distinct u.id),
            'average_rating', round(avg(i.rating)::numeric, 1)
         )
         from follows f
         join users u on u.id = f.followee_id
         join items i on i.user_id = u.id
         where f.follower_id = $1
           and u.is_public and u.deleted_at is null
           and i.status = 'done'
           and i.rating >= 8
           and not i.public_hidden
           and i.deleted_at is null
           and 'done' = ANY(u.public_statuses)
           and not exists (
               select 1 from items mine
               where mine.user_id = $1
                 and mine.deleted_at is null
                 and (
                     (i.external_source is not null
                      and mine.external_source = i.external_source
                      and mine.external_id = i.external_id)
                     or lower(mine.title) = lower(i.title)
                 )
           )
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         group by i.id
         order by avg(i.rating) desc, count(distinct u.id) desc, i.updated_at desc
         limit 12",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok(Json(json!({ "items": items })))
}

/// `GET /api/v1/recommendations/taste` — genres from high ratings and public matches.
pub async fn taste(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let genres: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object('name', genre, 'count', count(*))
         from items i
         cross join lateral jsonb_array_elements_text(
             coalesce(i.details->'genres', '[]'::jsonb)
         ) as genre
         where i.user_id = $1
           and i.status = 'done'
           and i.rating >= 8
           and i.deleted_at is null
           and i.details is not null
         group by genre
         order by count(*) desc, genre
         limit 8",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let items: Vec<Value> = sqlx::query_scalar(
        "with top_genres as (
             select genre
             from items i
             cross join lateral jsonb_array_elements_text(
                 coalesce(i.details->'genres', '[]'::jsonb)
             ) as genre
             where i.user_id = $1
               and i.status = 'done'
               and i.rating >= 8
               and i.deleted_at is null
               and i.details is not null
             group by genre
             order by count(*) desc, genre
             limit 5
         )
         select jsonb_build_object(
             'id', i.id,
             'author_id', u.id,
             'author_name', u.display_name,
             'kind', i.kind,
             'title', i.title,
             'subtitle', i.subtitle,
             'year', i.year,
             'status', i.status,
             'rating', i.rating,
             'review', i.review,
             'cover_key', i.cover_key,
             'external_source', i.external_source,
             'external_id', i.external_id,
             'details', i.details,
             'updated_at', i.updated_at,
             'matched_genres', jsonb_agg(distinct genre)
         )
         from items i
         join users u on u.id = i.user_id
         cross join lateral jsonb_array_elements_text(
             coalesce(i.details->'genres', '[]'::jsonb)
         ) as genre
         where i.user_id <> $1
           and u.is_public and u.deleted_at is null
           and i.status = 'done' and i.rating >= 7
           and not i.public_hidden and i.deleted_at is null
           and 'done' = ANY(u.public_statuses)
           and genre in (select genre from top_genres)
           and not exists (
               select 1 from items mine
               where mine.user_id = $1
                 and mine.deleted_at is null
                 and (
                     (i.external_source is not null
                      and mine.external_source = i.external_source
                      and mine.external_id = i.external_id)
                     or lower(mine.title) = lower(i.title)
                 )
           )
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         group by i.id, u.id, u.display_name
         order by i.rating desc, i.updated_at desc
         limit 12",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok(Json(json!({ "genres": genres, "items": items })))
}
