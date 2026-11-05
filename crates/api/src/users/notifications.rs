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
    state: &AppState,
    actor_id: Uuid,
    actor_name: &str,
    item_id: Uuid,
    item_title: &str,
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
    .execute(&state.pool)
    .await;

    let recipients: Vec<Uuid> = sqlx::query_scalar(
        "select f.follower_id
         from follows f
         join users follower on follower.id = f.follower_id
         join users actor on actor.id = $1
         where f.followee_id = $1
           and f.notifications
           and coalesce((follower.notification_prefs->>'item')::boolean, true)
           and follower.deleted_at is null
           and $2 = ANY(actor.public_statuses)
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = f.follower_id)
                  or (b.blocker_id = f.follower_id and b.blocked_id = $1)
           )",
    )
    .bind(actor_id)
    .bind(status)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();
    for recipient in recipients {
        crate::push::send_to_user(
            state,
            recipient,
            "Новая запись",
            &format!("{actor_name} добавил(а) «{item_title}»"),
            &format!("/u/{actor_id}/{item_id}"),
        )
        .await;
    }
}

/// Creates a comment/reply/reaction notification if the recipient opted in.
///
/// The caller has already checked that the target item/comment is public.
pub struct SocialNotification<'a> {
    pub kind: &'a str,
    pub item_id: Uuid,
    pub comment_id: Option<Uuid>,
    pub push_body: &'a str,
    pub url: &'a str,
}

pub async fn notify_social(
    state: &AppState,
    target_id: Uuid,
    actor_id: Uuid,
    notice: SocialNotification<'_>,
) {
    if target_id == actor_id {
        return;
    }
    let SocialNotification {
        kind,
        item_id,
        comment_id,
        push_body,
        url,
    } = notice;
    let pref_key = if kind == "reaction" {
        "reaction"
    } else {
        "comment"
    };
    let recipient: Option<(bool,)> = sqlx::query_as(
        "select coalesce((notification_prefs->>$2)::boolean, true)
         from users where id = $1 and deleted_at is null
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = $3)
                  or (b.blocker_id = $3 and b.blocked_id = $1)
           )",
    )
    .bind(target_id)
    .bind(pref_key)
    .bind(actor_id)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten();
    let Some((enabled,)) = recipient else {
        return;
    };
    if !enabled {
        return;
    }
    if kind == "reaction" {
        let already: bool = sqlx::query_scalar(
            "select exists(
                 select 1 from notifications
                 where user_id = $1 and actor_id = $2 and kind = 'reaction'
                   and item_id = $3 and comment_id is not distinct from $4
             )",
        )
        .bind(target_id)
        .bind(actor_id)
        .bind(item_id)
        .bind(comment_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(false);
        if already {
            return;
        }
    }
    let id = Uuid::new_v4();
    let inserted = sqlx::query(
        "insert into notifications (id, user_id, actor_id, kind, item_id, comment_id)
         values ($1, $2, $3, $4, $5, $6)
         on conflict do nothing",
    )
    .bind(id)
    .bind(target_id)
    .bind(actor_id)
    .bind(kind)
    .bind(item_id)
    .bind(comment_id)
    .execute(&state.pool)
    .await
    .is_ok();
    if inserted {
        crate::push::send_to_user(state, target_id, "Новое уведомление", push_body, url).await;
    }
}

/// Tells the reporter that a moderator reached a decision.
pub async fn notify_report(
    state: &AppState,
    reporter_id: Uuid,
    admin_id: Uuid,
    report_id: Uuid,
    item_id: Option<Uuid>,
    status: &str,
) {
    if reporter_id == admin_id {
        return;
    }
    let body = match status {
        "archived" => "Контент скрыт по вашей жалобе",
        "dismissed" => "Жалоба отклонена",
        _ => "Жалоба рассмотрена",
    };
    let inserted = sqlx::query(
        "insert into notifications (id, user_id, actor_id, kind, item_id, report_id)
         values ($1, $2, $3, 'report', $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(reporter_id)
    .bind(admin_id)
    .bind(item_id)
    .bind(report_id)
    .execute(&state.pool)
    .await
    .is_ok();
    if inserted {
        crate::push::send_to_user(state, reporter_id, "Жалоба обработана", body, "/").await;
    }
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
            'item_slug', i.slug,
            'item_author_id', i.user_id,
            'item_author_handle', owner.handle,
            'item_title', i.title,
            'item_kind', i.kind,
            'comment_id', n.comment_id,
            'comment_body', left(c.body, 120),
            'report_id', n.report_id,
            'created_at', n.created_at,
            'read', n.read_at is not null
         )
         from notifications n
         join users u on u.id = n.actor_id
         left join items i on i.id = n.item_id
         left join users owner on owner.id = i.user_id
         left join comments c on c.id = n.comment_id
         where n.user_id = $1
           and u.deleted_at is null
           and (n.comment_id is null or c.deleted_at is null)
           and (
               n.kind = 'follow'
               or n.kind = 'report'
               or (i.id is not null and not i.public_hidden and i.deleted_at is null
                   and i.status = ANY(owner.public_statuses))
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
