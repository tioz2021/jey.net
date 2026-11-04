//! Recommendations from public ratings of followed profiles.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

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
