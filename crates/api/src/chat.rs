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
