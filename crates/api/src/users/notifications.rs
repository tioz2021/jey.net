//! In-app notifications: currently new followers.

use axum::Json;
use axum::extract::{Path, State};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, serde::Serialize)]
pub struct NotificationPreferences {
    pub follow: bool,
    pub item: bool,
    pub comment: bool,
    pub reaction: bool,
}

#[derive(Debug, Deserialize)]
pub struct PreferencesPatch {
    pub follow: Option<bool>,
    pub item: Option<bool>,
    pub comment: Option<bool>,
    pub reaction: Option<bool>,
}

/// `GET /api/v1/notifications/settings`
pub async fn get_settings(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let prefs: Option<Value> =
        sqlx::query_scalar("select notification_prefs from users where id = $1")
            .bind(current.user.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(AppError::internal)?;
    let prefs = prefs.unwrap_or_else(|| {
        json!({
            "follow": true, "item": true, "comment": true, "reaction": true
        })
    });
    Ok(Json(json!({ "preferences": prefs })))
}

/// `PATCH /api/v1/notifications/settings`
pub async fn update_settings(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(patch): Json<PreferencesPatch>,
) -> Result<Json<Value>, AppError> {
    let prefs: Value = sqlx::query_scalar(
        "update users
         set notification_prefs = notification_prefs || jsonb_strip_nulls($2)
         where id = $1
         returning notification_prefs",
    )
    .bind(current.user.id)
    .bind(json!({
        "follow": patch.follow,
        "item": patch.item,
        "comment": patch.comment,
        "reaction": patch.reaction,
    }))
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "preferences": prefs })))
}

/// Creates one notification per follower for a newly public record.
///
/// Failures are intentionally non-fatal for the item creation request.
pub async fn notify_new_item(
    pool: &sqlx::PgPool,
    actor_id: Uuid,
    item_id: Uuid,
    status: &str,
    public_hidden: bool,
) {
    if public_hidden {
        return;
    }
    let _ = sqlx::query(
        "insert into notifications (id, user_id, actor_id, kind, item_id)
         select gen_random_uuid(), f.follower_id, $1, 'item', $2
         from follows f
         join users follower on follower.id = f.follower_id
         join users actor on actor.id = $1
         where f.followee_id = $1
           and f.notifications
           and coalesce((follower.notification_prefs->>'item')::boolean, true)
           and follower.deleted_at is null
           and $3 = ANY(actor.public_statuses)
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = f.follower_id)
                  or (b.blocker_id = f.follower_id and b.blocked_id = $1)
           )
         on conflict (user_id, item_id) where item_id is not null do nothing",
    )
    .bind(actor_id)
    .bind(item_id)
    .bind(status)
    .execute(pool)
    .await;
}

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
            'item_id', n.item_id,
            'item_title', i.title,
            'item_kind', i.kind,
            'created_at', n.created_at,
            'read', n.read_at is not null
         )
         from notifications n
         join users u on u.id = n.actor_id
         left join items i on i.id = n.item_id
         where n.user_id = $1
           and u.deleted_at is null
           and (
               n.kind = 'follow'
               or (i.id is not null and not i.public_hidden and i.deleted_at is null
                   and i.status = ANY(u.public_statuses))
           )
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

#[derive(Debug, Deserialize)]
pub struct MarkReadBody {
    before: Option<DateTime<Utc>>,
}

/// `POST /api/v1/notifications/read` — marks only what was on screen.
pub async fn mark_all_read(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Option<Json<MarkReadBody>>,
) -> Result<Json<Value>, AppError> {
    let before = payload.and_then(|Json(body)| body.before);
    sqlx::query(
        "update notifications set read_at = now()
         where user_id = $1 and read_at is null
           and ($2::timestamptz is null or created_at <= $2)",
    )
    .bind(current.user.id)
    .bind(before)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let unread: i64 = sqlx::query_scalar(
        "select count(*) from notifications where user_id = $1 and read_at is null",
    )
    .bind(current.user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "unread": unread })))
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
