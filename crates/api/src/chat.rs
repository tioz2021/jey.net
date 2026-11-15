//! Direct conversations between two accounts.
//!
//! T135 covers the inbox and thread lifecycle. Message history and read
//! receipts arrive with T136; the payload already exposes the last message and
//! unread count so the web inbox can be built without another shape change.

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct NewThread {
    pub user_id: Uuid,
}

fn direct_key(a: Uuid, b: Uuid) -> String {
    let mut ids = [a.to_string(), b.to_string()];
    ids.sort();
    format!("{}:{}", ids[0], ids[1])
}

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

async fn message_policy(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    sqlx::query_scalar(
        "select coalesce(
            (select message_policy from chat_settings where user_id = $1),
            'all'
         )",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

async fn can_start(state: &AppState, sender: Uuid, target: Uuid) -> Result<(), AppError> {
    if sender == target {
        return Err(AppError::validation_field(
            "user_id",
            "cannot start a conversation with yourself",
        ));
    }

    let target_active: bool = sqlx::query_scalar(
        "select exists(
            select 1 from users
            where id = $1 and deleted_at is null and suspended_at is null
        )",
    )
    .bind(target)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if !target_active {
        return Err(AppError::not_found("profile"));
    }

    if blocked_between(&state.pool, sender, target).await? {
        return Err(AppError::forbidden("profile is blocked"));
    }

    match message_policy(&state.pool, target).await?.as_str() {
        "all" => Ok(()),
        "following" => {
            let follows: bool = sqlx::query_scalar(
                "select exists(select 1 from follows
                 where follower_id = $1 and followee_id = $2)",
            )
            .bind(target)
            .bind(sender)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
            if follows {
                Ok(())
            } else {
                Err(AppError::forbidden("profile does not accept messages"))
            }
        }
        _ => Err(AppError::forbidden("profile does not accept messages")),
    }
}

async fn thread_payload(pool: &PgPool, viewer: Uuid, thread_id: Uuid) -> Result<Value, AppError> {
    sqlx::query_scalar(
        "select jsonb_build_object(
            'id', t.id,
            'kind', t.kind,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'peer', jsonb_build_object(
                'id', peer.id,
                'handle', peer.handle,
                'display_name', peer.display_name,
                'avatar_key', peer.avatar_key
            ),
            'last_message', (
                select jsonb_build_object(
                    'id', lm.id,
                    'sender_id', lm.sender_id,
                    'body', lm.body,
                    'created_at', lm.created_at
                )
                from chat_messages lm
                where lm.thread_id = t.id and lm.deleted_at is null
                order by lm.created_at desc, lm.id desc
                limit 1
            ),
            'unread', (
                select count(*)
                from chat_messages um
                where um.thread_id = t.id
                  and um.sender_id <> $2
                  and um.deleted_at is null
                  and (cm.last_read_at is null or um.created_at > cm.last_read_at)
            )
        )
        from chat_threads t
        join chat_members cm on cm.thread_id = t.id and cm.user_id = $2
        join chat_members peer_member
          on peer_member.thread_id = t.id and peer_member.user_id <> $2
        join users peer on peer.id = peer_member.user_id
        where t.id = $1 and t.kind = 'direct'
        limit 1",
    )
    .bind(thread_id)
    .bind(viewer)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("conversation"))
}

/// `GET /api/v1/chat/threads` — visible conversations of the current account.
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let threads: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', t.id,
            'kind', t.kind,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'peer', jsonb_build_object(
                'id', peer.id,
                'handle', peer.handle,
                'display_name', peer.display_name,
                'avatar_key', peer.avatar_key
            ),
            'last_message', (
                select jsonb_build_object(
                    'id', lm.id,
                    'sender_id', lm.sender_id,
                    'body', lm.body,
                    'created_at', lm.created_at
                )
                from chat_messages lm
                where lm.thread_id = t.id and lm.deleted_at is null
                order by lm.created_at desc, lm.id desc
                limit 1
            ),
            'unread', (
                select count(*)
                from chat_messages um
                where um.thread_id = t.id
                  and um.sender_id <> $1
                  and um.deleted_at is null
                  and (cm.last_read_at is null or um.created_at > cm.last_read_at)
            )
        )
        from chat_threads t
        join chat_members cm on cm.thread_id = t.id and cm.user_id = $1
        join chat_members peer_member
          on peer_member.thread_id = t.id and peer_member.user_id <> $1
        join users peer on peer.id = peer_member.user_id
        where cm.hidden_at is null and t.kind = 'direct'
        order by t.updated_at desc
        limit 100",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok(Json(json!({ "threads": threads })))
}

/// `POST /api/v1/chat/threads` — find or create a direct conversation.
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<NewThread>,
) -> Result<Json<Value>, AppError> {
    can_start(&state, current.user.id, payload.user_id).await?;
    let key = direct_key(current.user.id, payload.user_id);

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "insert into chat_threads (direct_key) values ($1)
         on conflict (direct_key) do nothing
         returning id",
    )
    .bind(&key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(AppError::internal)?;

    let thread_id = match inserted {
        Some(id) => id,
        None => sqlx::query_scalar("select id from chat_threads where direct_key = $1")
            .bind(&key)
            .fetch_one(&mut *tx)
            .await
            .map_err(AppError::internal)?,
    };

    for user_id in [current.user.id, payload.user_id] {
        sqlx::query(
            "insert into chat_members (thread_id, user_id) values ($1, $2)
             on conflict (thread_id, user_id) do nothing",
        )
        .bind(thread_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    }
    sqlx::query(
        "update chat_members set hidden_at = null
         where thread_id = $1 and user_id = $2",
    )
    .bind(thread_id)
    .bind(current.user.id)
    .execute(&mut *tx)
    .await
    .map_err(AppError::internal)?;
    tx.commit().await.map_err(AppError::internal)?;

    let thread = thread_payload(&state.pool, current.user.id, thread_id).await?;
    Ok(Json(
        json!({ "thread": thread, "created": inserted.is_some() }),
    ))
}

/// `GET /api/v1/chat/threads/{id}` — one conversation for its members.
pub async fn get(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let thread = thread_payload(&state.pool, current.user.id, thread_id).await?;
    Ok(Json(json!({ "thread": thread })))
}

/// `DELETE /api/v1/chat/threads/{id}` — hide a conversation for this account.
pub async fn hide(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_members set hidden_at = now()
         where thread_id = $1 and user_id = $2",
    )
    .bind(thread_id)
    .bind(current.user.id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();

    if changed == 0 {
        return Err(AppError::not_found("conversation"));
    }
    Ok(Json(json!({ "hidden": true })))
}

#[derive(Debug, Deserialize)]
pub struct NewMessage {
    pub body: String,
    pub client_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub before: Option<Uuid>,
    pub limit: Option<i64>,
}

fn normalize_body(raw: &str) -> Result<String, AppError> {
    let body = raw.trim();
    if body.is_empty() {
        return Err(AppError::validation_field(
            "body",
            "message cannot be empty",
        ));
    }
    if body.chars().count() > 4000 {
        return Err(AppError::validation_field("body", "message is too long"));
    }
    if body
        .chars()
        .any(|ch| ch.is_control() && ch != '\n' && ch != '\t')
    {
        return Err(AppError::validation_field(
            "body",
            "message contains unsupported control characters",
        ));
    }
    Ok(body.to_owned())
}

async fn require_member(pool: &PgPool, thread_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let member: bool = sqlx::query_scalar(
        "select exists(select 1 from chat_members where thread_id = $1 and user_id = $2)",
    )
    .bind(thread_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if member {
        Ok(())
    } else {
        Err(AppError::not_found("conversation"))
    }
}

async fn peer_id(pool: &PgPool, thread_id: Uuid, viewer: Uuid) -> Result<Uuid, AppError> {
    sqlx::query_scalar(
        "select user_id from chat_members
         where thread_id = $1 and user_id <> $2
         limit 1",
    )
    .bind(thread_id)
    .bind(viewer)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("conversation"))
}

async fn message_payload(
    pool: &PgPool,
    thread_id: Uuid,
    message_id: Uuid,
) -> Result<Value, AppError> {
    sqlx::query_scalar(
        "select jsonb_build_object(
            'id', m.id,
            'thread_id', m.thread_id,
            'sender_id', m.sender_id,
            'body', m.body,
            'client_id', m.client_id,
            'created_at', m.created_at
        )
        from chat_messages m
        where m.id = $1 and m.thread_id = $2 and m.deleted_at is null",
    )
    .bind(message_id)
    .bind(thread_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("message"))
}

/// `POST /api/v1/chat/threads/{id}/messages`
pub async fn send(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
    Json(payload): Json<NewMessage>,
) -> Result<Json<Value>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    can_start(&state, current.user.id, target).await?;
    let body = normalize_body(&payload.body)?;

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "insert into chat_messages (thread_id, sender_id, body, client_id)
         values ($1, $2, $3, $4)
         on conflict (thread_id, client_id) do nothing
         returning id",
    )
    .bind(thread_id)
    .bind(current.user.id)
    .bind(&body)
    .bind(payload.client_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(AppError::internal)?;

    let message_id = match inserted {
        Some(id) => {
            sqlx::query("update chat_threads set updated_at = now() where id = $1")
                .bind(thread_id)
                .execute(&mut *tx)
                .await
                .map_err(AppError::internal)?;
            // A new message brings a hidden conversation back for both sides.
            sqlx::query(
                "update chat_members set hidden_at = null, last_read_at = case
                    when user_id = $2 then now() else last_read_at end
                 where thread_id = $1",
            )
            .bind(thread_id)
            .bind(current.user.id)
            .execute(&mut *tx)
            .await
            .map_err(AppError::internal)?;
            id
        }
        None => {
            let (id, stored): (Uuid, String) = sqlx::query_as(
                "select id, body from chat_messages
                 where thread_id = $1 and client_id = $2",
            )
            .bind(thread_id)
            .bind(payload.client_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(AppError::internal)?;
            if stored != body {
                return Err(AppError::conflict(
                    "client_id was already used for another message",
                ));
            }
            id
        }
    };
    tx.commit().await.map_err(AppError::internal)?;

    let message = message_payload(&state.pool, thread_id, message_id).await?;
    Ok(Json(json!({
        "message": message,
        "created": inserted.is_some()
    })))
}

/// `GET /api/v1/chat/threads/{id}/messages?before=&limit=`
pub async fn history(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<Json<Value>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let limit = query.limit.unwrap_or(50).clamp(1, 100);

    let messages: Vec<Value> = if let Some(before) = query.before {
        let cursor: Option<(chrono::DateTime<chrono::Utc>, Uuid)> = sqlx::query_as(
            "select created_at, id from chat_messages
             where id = $1 and thread_id = $2 and deleted_at is null",
        )
        .bind(before)
        .bind(thread_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?;
        let Some((created_at, id)) = cursor else {
            return Err(AppError::validation_field("before", "unknown message"));
        };
        sqlx::query_scalar(
            "select jsonb_build_object(
                'id', m.id, 'thread_id', m.thread_id, 'sender_id', m.sender_id,
                'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at
             )
             from chat_messages m
             where m.thread_id = $1 and m.deleted_at is null
               and (m.created_at, m.id) < ($2, $3)
             order by m.created_at desc, m.id desc
             limit $4",
        )
        .bind(thread_id)
        .bind(created_at)
        .bind(id)
        .bind(limit + 1)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?
    } else {
        sqlx::query_scalar(
            "select jsonb_build_object(
                'id', m.id, 'thread_id', m.thread_id, 'sender_id', m.sender_id,
                'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at
             )
             from chat_messages m
             where m.thread_id = $1 and m.deleted_at is null
             order by m.created_at desc, m.id desc
             limit $2",
        )
        .bind(thread_id)
        .bind(limit + 1)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?
    };

    let mut messages = messages;
    let has_more = messages.len() > limit as usize;
    if has_more {
        messages.truncate(limit as usize);
    }
    let next_before = if has_more {
        messages
            .last()
            .and_then(|value| value.get("id")?.as_str())
            .map(str::to_owned)
    } else {
        None
    };
    messages.reverse();
    Ok(Json(json!({
        "messages": messages,
        "next_before": next_before
    })))
}

/// `POST /api/v1/chat/threads/{id}/read`
pub async fn mark_read(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_members set last_read_at = now(), hidden_at = null
         where thread_id = $1 and user_id = $2",
    )
    .bind(thread_id)
    .bind(current.user.id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();

    if changed == 0 {
        return Err(AppError::not_found("conversation"));
    }
    Ok(Json(json!({ "read": true })))
}
