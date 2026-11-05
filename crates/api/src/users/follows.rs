//! One-way subscriptions to public profiles and the resulting feed.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

async fn blocked_between(pool: &PgPool, a: Uuid, b: Uuid) -> Result<bool, AppError> {
    sqlx::query_scalar(
        "select exists(select 1 from blocks
         where (blocker_id = $1 and blocked_id = $2)
            or (blocker_id = $2 and blocked_id = $1))",
    )
    .bind(a)
    .bind(b)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

async fn public_target(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from users where id = $1 and is_public and deleted_at is null)",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if !exists {
        return Err(AppError::not_found("profile"));
    }
    Ok(())
}

async fn counts(pool: &PgPool, user_id: Uuid) -> Result<(i64, i64), AppError> {
    let row: (i64, i64) = sqlx::query_as(
        "select
            (select count(*) from follows where followee_id = $1),
            (select count(*) from follows where follower_id = $1)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    Ok(row)
}

/// `POST /api/v1/users/{id}/follow`
pub async fn follow(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    if target == current.user.id {
        return Err(AppError::validation_field("id", "cannot follow yourself"));
    }
    public_target(&state.pool, target).await?;
    if blocked_between(&state.pool, current.user.id, target).await? {
        return Err(AppError::forbidden("profile is blocked"));
    }
    sqlx::query(
        "insert into follows (follower_id, followee_id) values ($1, $2)
         on conflict do nothing",
    )
    .bind(current.user.id)
    .bind(target)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let wants_follow: bool = sqlx::query_scalar(
        "select coalesce((notification_prefs->>'follow')::boolean, true)
         from users where id = $1",
    )
    .bind(target)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if wants_follow {
        sqlx::query(
            "insert into notifications (id, user_id, actor_id, kind)
             values (gen_random_uuid(), $1, $2, 'follow')
             on conflict (user_id, actor_id, kind)
             do update set created_at = now(), read_at = null",
        )
        .bind(target)
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
        crate::push::send_to_user(
            &state,
            target,
            "Новый подписчик",
            &format!("{} подписался(-ась) на вас", current.user.display_name),
            "/notifications",
        )
        .await;
    }
    let (followers, following) = counts(&state.pool, target).await?;
    Ok(Json(
        json!({ "following": true, "followers": followers, "following_count": following }),
    ))
}

/// `DELETE /api/v1/users/{id}/follow`
pub async fn unfollow(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    public_target(&state.pool, target).await?;
    sqlx::query("delete from follows where follower_id = $1 and followee_id = $2")
        .bind(current.user.id)
        .bind(target)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    let (followers, following) = counts(&state.pool, target).await?;
    Ok(Json(
        json!({ "following": false, "followers": followers, "following_count": following }),
    ))
}

/// `GET /api/v1/users/{id}/follow` — state for the authenticated viewer.
pub async fn status(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    public_target(&state.pool, target).await?;
    let following: bool = sqlx::query_scalar(
        "select exists(select 1 from follows where follower_id = $1 and followee_id = $2)",
    )
    .bind(current.user.id)
    .bind(target)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let (followers, following_count) = counts(&state.pool, target).await?;
    let blocked = blocked_between(&state.pool, current.user.id, target).await?;
    Ok(Json(json!({
        "following": following,
        "blocked": blocked,
        "followers": followers,
        "following_count": following_count,
    })))
}

/// `GET /api/v1/feed` — recent public records of followed profiles.
pub async fn feed(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let items: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', i.id, 'author_id', u.id, 'author_name', u.display_name,
            'kind', i.kind, 'title', i.title, 'subtitle', i.subtitle,
            'year', i.year, 'status', i.status, 'rating', i.rating,
            'review', i.review, 'cover_key', i.cover_key,
            'external_source', i.external_source, 'external_id', i.external_id,
            'details', i.details, 'public_hidden', i.public_hidden,
            'updated_at', i.updated_at
         )
         from follows f
         join users u on u.id = f.followee_id
         join items i on i.user_id = u.id
         where f.follower_id = $1
           and f.notifications
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)
           and not i.public_hidden and i.deleted_at is null
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         order by i.updated_at desc
         limit 50",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "items": items })))
}

/// `GET /api/v1/blocks` — profiles blocked by the current account.
pub async fn blocked(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let people: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', u.id,
            'display_name', u.display_name,
            'avatar_key', u.avatar_key,
            'blocked_at', b.created_at
         )
         from blocks b
         join users u on u.id = b.blocked_id
         where b.blocker_id = $1 and u.deleted_at is null
         order by b.created_at desc
         limit 200",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "people": people })))
}

/// `POST /api/v1/users/{id}/block`
pub async fn block(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    if target == current.user.id {
        return Err(AppError::validation_field("id", "cannot block yourself"));
    }
    public_target(&state.pool, target).await?;
    sqlx::query(
        "insert into blocks (blocker_id, blocked_id) values ($1, $2)
         on conflict do nothing",
    )
    .bind(current.user.id)
    .bind(target)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    sqlx::query("delete from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)")
        .bind(current.user.id)
        .bind(target)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "blocked": true })))
}

/// `DELETE /api/v1/users/{id}/block`
pub async fn unblock(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("delete from blocks where blocker_id = $1 and blocked_id = $2")
        .bind(current.user.id)
        .bind(target)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "blocked": false })))
}

/// `GET /api/v1/follows/following` — profiles the current account follows.
pub async fn following(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let people: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', u.id,
            'display_name', u.display_name,
            'avatar_key', u.avatar_key,
            'notifications', f.notifications
         )
         from follows f
         join users u on u.id = f.followee_id
         where f.follower_id = $1
           and u.is_public and u.deleted_at is null
         order by f.created_at desc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "people": people })))
}

/// `PATCH /api/v1/users/{id}/follow/notifications` — mute/unmute a follow.
pub async fn notifications(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(target): Path<Uuid>,
    Json(payload): Json<NotificationsPayload>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update follows set notifications = $3
         where follower_id = $1 and followee_id = $2",
    )
    .bind(current.user.id)
    .bind(target)
    .bind(payload.enabled)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("follow"));
    }
    Ok(Json(json!({ "enabled": payload.enabled })))
}

#[derive(Debug, serde::Deserialize)]
pub struct NotificationsPayload {
    pub enabled: bool,
}
