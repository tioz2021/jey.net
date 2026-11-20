//! One like per person on a public record.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::users::notifications::{SocialNotification, notify_social};

#[derive(Debug, serde::Deserialize)]
pub struct LikedQuery {
    pub kind: Option<String>,
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

const LIKED_KINDS: [&str; 7] = ["movie", "tv", "anime", "book", "game", "image", "other"];

fn liked_kind(raw: Option<&str>) -> Result<Option<&str>, AppError> {
    match raw {
        None | Some("") => Ok(None),
        Some(value) if LIKED_KINDS.contains(&value) => Ok(Some(value)),
        _ => Err(AppError::validation_field("kind", "unknown catalogue kind")),
    }
}

fn liked_page(offset: Option<i64>, limit: Option<i64>) -> Result<(i64, i64), AppError> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(20);
    if offset < 0 || !(1..=50).contains(&limit) {
        return Err(AppError::validation_field(
            "pagination",
            "offset must be >= 0 and limit between 1 and 50",
        ));
    }
    Ok((offset, limit))
}

/// `GET /api/v1/liked` — public records liked by the current user.
pub async fn liked(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<LikedQuery>,
) -> Result<Json<Value>, AppError> {
    let kind = liked_kind(query.kind.as_deref())?;
    let (offset, limit) = liked_page(query.offset, query.limit)?;
    let items: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', i.id, 'slug', i.slug,
            'author_id', u.id, 'author_name', u.display_name, 'author_handle', u.handle,
            'kind', i.kind, 'title', i.title, 'subtitle', i.subtitle,
            'year', i.year, 'status', i.status, 'rating', i.rating,
            'review', i.review, 'cover_key', i.cover_key,
            'external_source', i.external_source, 'external_id', i.external_id,
            'details', i.details, 'updated_at', i.updated_at,
            'liked_at', r.created_at
         )
         from reactions r
         join items i on i.id = r.item_id
         join users u on u.id = i.user_id
         where r.user_id = $1
           and ($2::text is null or i.kind = $2)
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)
           and not i.public_hidden and i.deleted_at is null
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         order by r.created_at desc
         limit $4 offset $3",
    )
    .bind(current.user.id)
    .bind(kind)
    .bind(offset)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let next_offset = (items.len() as i64 == limit).then_some(offset + limit);
    Ok(Json(json!({ "items": items, "next_offset": next_offset })))
}

async fn ensure_public_item(pool: &sqlx::PgPool, item_id: Uuid) -> Result<Uuid, AppError> {
    let owner: Option<Uuid> = sqlx::query_scalar(
        "select i.user_id from items i join users u on u.id = i.user_id
         where i.id = $1 and i.deleted_at is null and not i.public_hidden
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    owner.ok_or_else(|| AppError::not_found("record"))
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
    let owner = ensure_public_item(&state.pool, item_id).await?;
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
    if !removed {
        notify_social(
            &state,
            owner,
            current.user.id,
            SocialNotification {
                kind: "reaction",
                item_id,
                comment_id: None,
                push_body: &format!(
                    "{} отреагировал(а) на вашу запись",
                    current.user.display_name
                ),
                url: &format!("/u/{owner}/{item_id}"),
            },
        )
        .await;
    }
    let count: i64 = sqlx::query_scalar("select count(*) from reactions where item_id = $1")
        .bind(item_id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "reacted": !removed, "count": count })))
}
