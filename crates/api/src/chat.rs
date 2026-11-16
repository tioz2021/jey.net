//! Direct conversations between two accounts.
//!
//! T135 covers the inbox and thread lifecycle. Message history and read
//! receipts arrive with T136; the payload already exposes the last message and
//! unread count so the web inbox can be built without another shape change.

use axum::Json;
use axum::extract::{Path, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct NewThread {
    pub user_id: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatEvent {
    pub kind: String,
    pub thread_id: Uuid,
    pub recipients: Vec<Uuid>,
    pub message: Option<Value>,
    pub read_by: Option<Uuid>,
    pub typing_by: Option<Uuid>,
    #[serde(default)]
    pub origin: Uuid,
}

#[derive(Serialize)]
struct ChatEventWire<'a> {
    kind: &'a str,
    thread_id: Uuid,
    message: &'a Option<Value>,
    read_by: Option<Uuid>,
    typing_by: Option<Uuid>,
}

impl ChatEvent {
    fn sse(&self) -> axum::response::sse::Event {
        let wire = ChatEventWire {
            kind: &self.kind,
            thread_id: self.thread_id,
            message: &self.message,
            read_by: self.read_by,
            typing_by: self.typing_by,
        };
        let data = serde_json::to_string(&wire).unwrap_or_else(|_| "{}".to_owned());
        axum::response::sse::Event::default()
            .event(self.kind.clone())
            .data(data)
    }
}

#[derive(Clone)]
pub struct ChatEvents {
    tx: broadcast::Sender<ChatEvent>,
    instance: Uuid,
}

impl ChatEvents {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            tx,
            instance: Uuid::new_v4(),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ChatEvent> {
        self.tx.subscribe()
    }

    fn forward(&self, event: ChatEvent) {
        let _ = self.tx.send(event);
    }

    /// Publish locally and to other API instances through PostgreSQL.
    pub async fn publish(&self, pool: &PgPool, mut event: ChatEvent) {
        event.origin = self.instance;
        let _ = self.tx.send(event.clone());
        if let Ok(payload) = serde_json::to_string(&event) {
            let _ = sqlx::query("select pg_notify('chat_events', $1)")
                .bind(payload)
                .execute(pool)
                .await;
        }
    }
}

/// Starts the cross-instance listener. Failure to listen is non-fatal: the
/// instance keeps its in-process delivery and falls back to polling clients.
pub async fn spawn_listener(pool: PgPool, events: Arc<ChatEvents>) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect_with(&pool).await?;
    listener.listen("chat_events").await?;
    tokio::spawn(async move {
        loop {
            let notification = match listener.recv().await {
                Ok(notification) => notification,
                Err(error) => {
                    tracing::warn!(%error, "chat listener stopped");
                    break;
                }
            };
            let Ok(event) = serde_json::from_str::<ChatEvent>(notification.payload()) else {
                continue;
            };
            if event.origin != events.instance {
                events.forward(event);
            }
        }
    });
    Ok(())
}

impl Default for ChatEvents {
    fn default() -> Self {
        Self::new()
    }
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
            'muted', cm.muted_at is not null,
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

/// `GET /api/v1/chat/stream` — SSE stream of events for the current account.
pub async fn stream(
    State(state): State<AppState>,
    current: CurrentUser,
) -> axum::response::sse::Sse<
    impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
> {
    use std::convert::Infallible;
    use tokio::sync::broadcast::error::RecvError;

    let mut rx = state.chat.subscribe();
    let user_id = current.user.id;
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) if event.recipients.contains(&user_id) => {
                    yield Ok::<_, Infallible>(event.sse());
                }
                Ok(_) => {}
                Err(RecvError::Lagged(_)) => {
                    yield Ok(axum::response::sse::Event::default()
                        .event("resync")
                        .data("{}"));
                }
                Err(RecvError::Closed) => break,
            }
        }
    };
    axum::response::sse::Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive"),
    )
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
            'muted', cm.muted_at is not null,
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
    pub q: Option<String>,
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
            'created_at', m.created_at,
            'edited_at', m.edited_at,
            'reactions', (
                select coalesce(jsonb_agg(jsonb_build_object(
                    'emoji', grouped.emoji,
                    'count', grouped.count,
                    'user_ids', grouped.user_ids
                ) order by grouped.first_at), '[]'::jsonb)
                from (
                    select emoji, count(*) as count,
                           jsonb_agg(user_id) as user_ids,
                           min(created_at) as first_at
                    from chat_reactions
                    where message_id = m.id
                    group by emoji
                ) grouped
            )
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
    state
        .chat
        .publish(
            &state.pool,
            ChatEvent {
                kind: "message.created".to_owned(),
                thread_id,
                recipients: vec![current.user.id, target],
                message: Some(message.clone()),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(json!({
        "message": message,
        "created": inserted.is_some()
    })))
}

#[derive(Debug, Deserialize)]
pub struct EditMessage {
    pub body: String,
}

/// `PATCH /api/v1/chat/threads/{id}/messages/{message_id}`
pub async fn edit(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((thread_id, message_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<EditMessage>,
) -> Result<Json<Value>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let body = normalize_body(&payload.body)?;
    let changed = sqlx::query(
        "update chat_messages set body = $1, edited_at = now()
         where id = $2 and thread_id = $3 and sender_id = $4 and deleted_at is null",
    )
    .bind(&body)
    .bind(message_id)
    .bind(thread_id)
    .bind(current.user.id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("message"));
    }
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    let message = message_payload(&state.pool, thread_id, message_id).await?;
    state
        .chat
        .publish(
            &state.pool,
            ChatEvent {
                kind: "message.updated".to_owned(),
                thread_id,
                recipients: vec![current.user.id, target],
                message: Some(message.clone()),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(json!({ "message": message })))
}

#[derive(Debug, Deserialize)]
pub struct ReactionBody {
    pub emoji: String,
}

/// `POST /api/v1/chat/threads/{id}/messages/{message_id}/reactions`
pub async fn toggle_reaction(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((thread_id, message_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ReactionBody>,
) -> Result<Json<Value>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let emoji = payload.emoji.trim();
    if emoji.is_empty() || emoji.chars().count() > 16 {
        return Err(AppError::validation_field(
            "emoji",
            "emoji must be 1..16 characters",
        ));
    }
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from chat_messages
         where id = $1 and thread_id = $2 and deleted_at is null)",
    )
    .bind(message_id)
    .bind(thread_id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if !exists {
        return Err(AppError::not_found("message"));
    }
    let removed = sqlx::query(
        "delete from chat_reactions where message_id = $1 and user_id = $2 and emoji = $3",
    )
    .bind(message_id)
    .bind(current.user.id)
    .bind(emoji)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected()
        > 0;
    if !removed {
        sqlx::query(
            "insert into chat_reactions (message_id, user_id, emoji) values ($1, $2, $3)
             on conflict (message_id, user_id, emoji) do nothing",
        )
        .bind(message_id)
        .bind(current.user.id)
        .bind(emoji)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    }
    let count: i64 = sqlx::query_scalar(
        "select count(*) from chat_reactions where message_id = $1 and emoji = $2",
    )
    .bind(message_id)
    .bind(emoji)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    let message = message_payload(&state.pool, thread_id, message_id).await?;
    state
        .chat
        .publish(
            &state.pool,
            ChatEvent {
                kind: "message.updated".to_owned(),
                thread_id,
                recipients: vec![current.user.id, target],
                message: Some(message.clone()),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(
        json!({ "message": message, "reacted": !removed, "count": count }),
    ))
}

/// `POST /api/v1/chat/threads/{id}/typing`
pub async fn typing(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    state
        .chat
        .publish(
            &state.pool,
            ChatEvent {
                kind: "typing".to_owned(),
                thread_id,
                recipients: vec![current.user.id, target],
                message: None,
                read_by: None,
                typing_by: Some(current.user.id),
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(json!({ "typing": true })))
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
    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if search.is_some_and(|value| value.chars().count() > 200) {
        return Err(AppError::validation_field("q", "search is too long"));
    }

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
                'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at,
                'edited_at', m.edited_at,
                'reactions', (
                    select coalesce(jsonb_agg(jsonb_build_object(
                        'emoji', grouped.emoji,
                        'count', grouped.count,
                        'user_ids', grouped.user_ids
                    ) order by grouped.first_at), '[]'::jsonb)
                    from (
                        select emoji, count(*) as count,
                               jsonb_agg(user_id) as user_ids,
                               min(created_at) as first_at
                        from chat_reactions
                        where message_id = m.id
                        group by emoji
                    ) grouped
                )
             )
             from chat_messages m
             where m.thread_id = $1 and m.deleted_at is null
               and (m.created_at, m.id) < ($2, $3)
               and ($4 = '' or m.body ilike '%' || $4 || '%')
             order by m.created_at desc, m.id desc
             limit $5",
        )
        .bind(thread_id)
        .bind(created_at)
        .bind(id)
        .bind(search.unwrap_or(""))
        .bind(limit + 1)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?
    } else {
        sqlx::query_scalar(
            "select jsonb_build_object(
                'id', m.id, 'thread_id', m.thread_id, 'sender_id', m.sender_id,
                'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at,
                'edited_at', m.edited_at,
                'reactions', (
                    select coalesce(jsonb_agg(jsonb_build_object(
                        'emoji', grouped.emoji,
                        'count', grouped.count,
                        'user_ids', grouped.user_ids
                    ) order by grouped.first_at), '[]'::jsonb)
                    from (
                        select emoji, count(*) as count,
                               jsonb_agg(user_id) as user_ids,
                               min(created_at) as first_at
                        from chat_reactions
                        where message_id = m.id
                        group by emoji
                    ) grouped
                )
             )
             from chat_messages m
             where m.thread_id = $1 and m.deleted_at is null
               and ($2 = '' or m.body ilike '%' || $2 || '%')
             order by m.created_at desc, m.id desc
             limit $3",
        )
        .bind(thread_id)
        .bind(search.unwrap_or(""))
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
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    state
        .chat
        .publish(
            &state.pool,
            ChatEvent {
                kind: "message.read".to_owned(),
                thread_id,
                recipients: vec![current.user.id, target],
                message: None,
                read_by: Some(current.user.id),
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(json!({ "read": true })))
}

/// `POST /api/v1/chat/threads/{id}/mute`
pub async fn mute(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_members set muted_at = now()
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
    Ok(Json(json!({ "muted": true })))
}

/// `DELETE /api/v1/chat/threads/{id}/mute`
pub async fn unmute(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_members set muted_at = null
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
    Ok(Json(json!({ "muted": false })))
}

#[derive(Debug, Deserialize)]
pub struct ChatSettingsPatch {
    pub message_policy: String,
}

fn valid_policy(value: &str) -> bool {
    matches!(value, "all" | "following" | "nobody")
}

/// `GET /api/v1/chat/settings`
pub async fn get_settings(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let policy: String = sqlx::query_scalar(
        "select coalesce(
            (select message_policy from chat_settings where user_id = $1),
            'all'
         )",
    )
    .bind(current.user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "message_policy": policy })))
}

/// `PATCH /api/v1/chat/settings`
pub async fn update_settings(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<ChatSettingsPatch>,
) -> Result<Json<Value>, AppError> {
    if !valid_policy(&payload.message_policy) {
        return Err(AppError::validation_field(
            "message_policy",
            "message_policy must be all, following or nobody",
        ));
    }
    sqlx::query(
        "insert into chat_settings (user_id, message_policy)
         values ($1, $2)
         on conflict (user_id) do update
         set message_policy = excluded.message_policy",
    )
    .bind(current.user.id)
    .bind(&payload.message_policy)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "message_policy": payload.message_policy })))
}

#[derive(Debug, Deserialize)]
pub struct NewDevice {
    pub device_id: Uuid,
    pub public_key: String,
    pub name: Option<String>,
}

fn validate_public_key(raw: &str) -> Result<(), AppError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw.trim())
        .map_err(|_| AppError::validation_field("public_key", "public_key must be base64"))?;
    if bytes.len() != 32 {
        return Err(AppError::validation_field(
            "public_key",
            "x25519 public_key must be 32 bytes",
        ));
    }
    Ok(())
}

async fn device_list(pool: &PgPool, user_id: Uuid) -> Result<Value, AppError> {
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from users where id = $1 and deleted_at is null)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if !exists {
        return Err(AppError::not_found("user"));
    }
    let devices: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'device_id', device_id,
            'public_key', public_key,
            'algorithm', algorithm,
            'name', name,
            'created_at', created_at,
            'updated_at', updated_at
        )
        from chat_devices
        where user_id = $1 and revoked_at is null
        order by updated_at desc
        limit 50",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)?;
    Ok(json!({ "devices": devices }))
}

/// `GET /api/v1/chat/devices` — public keys of the current account's devices.
pub async fn my_devices(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    Ok(Json(device_list(&state.pool, current.user.id).await?))
}

/// `POST /api/v1/chat/devices` — register or rotate a public device key.
pub async fn register_device(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<NewDevice>,
) -> Result<Json<Value>, AppError> {
    validate_public_key(&payload.public_key)?;
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if name.is_some_and(|value| value.chars().count() > 80) {
        return Err(AppError::validation_field(
            "name",
            "device name is too long",
        ));
    }
    sqlx::query(
        "insert into chat_devices (user_id, device_id, public_key, name)
         values ($1, $2, $3, $4)
         on conflict (user_id, device_id) do update set
            public_key = excluded.public_key,
            name = excluded.name,
            revoked_at = null,
            updated_at = now()",
    )
    .bind(current.user.id)
    .bind(payload.device_id)
    .bind(payload.public_key.trim())
    .bind(name)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "registered": true })))
}

/// `GET /api/v1/chat/users/{id}/devices` — recipient public keys for encryption.
pub async fn user_devices(
    State(state): State<AppState>,
    _current: CurrentUser,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    Ok(Json(device_list(&state.pool, user_id).await?))
}

/// `DELETE /api/v1/chat/devices/{device_id}` — revoke one of my devices.
pub async fn revoke_device(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_devices set revoked_at = now(), updated_at = now()
         where user_id = $1 and device_id = $2 and revoked_at is null",
    )
    .bind(current.user.id)
    .bind(device_id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("device"));
    }
    Ok(Json(json!({ "revoked": true })))
}
