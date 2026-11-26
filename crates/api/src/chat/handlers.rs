// Thread and message handlers.

/// `GET /api/v1/chat/threads` — visible conversations of the current account.
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<ChatThreadListResponse>, AppError> {
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

    let threads = threads
        .into_iter()
        .map(parse_chat_json)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(ChatThreadListResponse { threads }))
}

/// `POST /api/v1/chat/threads` — find or create a direct conversation.
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<NewThread>,
) -> Result<Json<ChatThreadResponse>, AppError> {
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
    Ok(Json(ChatThreadResponse {
        thread,
        created: inserted.is_some(),
    }))
}

/// `GET /api/v1/chat/threads/{id}` — one conversation for its members.
pub async fn get(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<ChatThreadResponse>, AppError> {
    let thread = thread_payload(&state.pool, current.user.id, thread_id).await?;
    Ok(Json(ChatThreadResponse {
        thread,
        created: false,
    }))
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
    pub body: Option<String>,
    pub client_id: Uuid,
    pub encrypted: Option<Value>,
    pub reply_to_id: Option<Uuid>,
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

fn validate_encrypted(value: &Value) -> Result<(), AppError> {
    let version = value.get("version").and_then(Value::as_i64);
    if version != Some(1) {
        return Err(AppError::validation_field(
            "encrypted",
            "unsupported version",
        ));
    }
    let envelopes = value
        .get("envelopes")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::validation_field("encrypted", "envelopes are required"))?;
    if envelopes.is_empty() || envelopes.len() > 50 {
        return Err(AppError::validation_field(
            "encrypted",
            "invalid envelope count",
        ));
    }
    for envelope in envelopes {
        let device_id = envelope
            .get("device_id")
            .and_then(Value::as_str)
            .unwrap_or("");
        Uuid::parse_str(device_id)
            .map_err(|_| AppError::validation_field("encrypted", "invalid device id"))?;
        if envelope.get("version").and_then(Value::as_i64) != Some(1) {
            return Err(AppError::validation_field(
                "encrypted",
                "invalid envelope version",
            ));
        }
        for field in ["ephemeral_public", "salt", "nonce", "ciphertext"] {
            let raw = envelope.get(field).and_then(Value::as_str).unwrap_or("");
            if raw.is_empty() || raw.len() > 8192 {
                return Err(AppError::validation_field(
                    "encrypted",
                    "invalid envelope field",
                ));
            }
        }
    }
    if serde_json::to_string(value)
        .map(|raw| raw.len())
        .unwrap_or(0)
        > 64 * 1024
    {
        return Err(AppError::validation_field(
            "encrypted",
            "envelope is too large",
        ));
    }
    Ok(())
}

fn encrypted_or_body(
    body: Option<String>,
    encrypted: Option<Value>,
) -> Result<(String, Option<Value>, Option<i32>), AppError> {
    match encrypted {
        Some(value) => {
            validate_encrypted(&value)?;
            Ok(("[encrypted]".to_owned(), Some(value), Some(1)))
        }
        None => {
            let body = normalize_body(body.as_deref().unwrap_or(""))?;
            Ok((body, None, None))
        }
    }
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
) -> Result<ChatMessageView, AppError> {
    let value = sqlx::query_scalar::<_, Value>(
        "select jsonb_build_object(
            'id', m.id,
            'thread_id', m.thread_id,
            'sender_id', m.sender_id,
            'body', m.body,
            'client_id', m.client_id,
            'created_at', m.created_at,
            'edited_at', m.edited_at,
            'reply_to_id', m.reply_to_id,
            'encrypted', m.encrypted,
            'encryption_version', m.encryption_version,
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
    .ok_or_else(|| AppError::not_found("message"))?;
    parse_chat_json(value)
}

/// `POST /api/v1/chat/threads/{id}/messages`
pub async fn send(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(thread_id): Path<Uuid>,
    Json(payload): Json<NewMessage>,
) -> Result<Json<ChatMessageCreated>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let target = peer_id(&state.pool, thread_id, current.user.id).await?;
    can_start(&state, current.user.id, target).await?;
    let (body, encrypted, encryption_version) =
        encrypted_or_body(payload.body.clone(), payload.encrypted.clone())?;
    if let Some(reply_to_id) = payload.reply_to_id {
        let exists: bool = sqlx::query_scalar(
            "select exists(select 1 from chat_messages
             where id = $1 and thread_id = $2 and deleted_at is null)",
        )
        .bind(reply_to_id)
        .bind(thread_id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
        if !exists {
            return Err(AppError::validation_field(
                "reply_to_id",
                "reply target is not in this conversation",
            ));
        }
    }

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "insert into chat_messages
            (thread_id, sender_id, body, client_id, encrypted, encryption_version, reply_to_id)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (thread_id, client_id) do nothing
         returning id",
    )
    .bind(thread_id)
    .bind(current.user.id)
    .bind(&body)
    .bind(payload.client_id)
    .bind(&encrypted)
    .bind(encryption_version)
    .bind(payload.reply_to_id)
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
            let (id, stored, stored_encrypted): (Uuid, String, Option<Value>) = sqlx::query_as(
                "select id, body, encrypted from chat_messages
                 where thread_id = $1 and client_id = $2",
            )
            .bind(thread_id)
            .bind(payload.client_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(AppError::internal)?;
            if stored != body || stored_encrypted != encrypted {
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
                message: Some(serde_json::to_value(&message).map_err(AppError::internal)?),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(ChatMessageCreated {
        message,
        created: inserted.is_some(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct EditMessage {
    pub body: Option<String>,
    pub encrypted: Option<Value>,
}

/// `PATCH /api/v1/chat/threads/{id}/messages/{message_id}`
pub async fn edit(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((thread_id, message_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<EditMessage>,
) -> Result<Json<ChatMessageResponse>, AppError> {
    require_member(&state.pool, thread_id, current.user.id).await?;
    let (body, encrypted, encryption_version) =
        encrypted_or_body(payload.body.clone(), payload.encrypted.clone())?;
    let changed = sqlx::query(
        "update chat_messages set body = $1, encrypted = $2,
            encryption_version = $3, edited_at = now()
         where id = $4 and thread_id = $5 and sender_id = $6 and deleted_at is null",
    )
    .bind(&body)
    .bind(&encrypted)
    .bind(encryption_version)
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
                message: Some(serde_json::to_value(&message).map_err(AppError::internal)?),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(ChatMessageResponse { message }))
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
) -> Result<Json<ChatReactionUpdate>, AppError> {
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
                message: Some(serde_json::to_value(&message).map_err(AppError::internal)?),
                read_by: None,
                typing_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;
    Ok(Json(ChatReactionUpdate {
        message,
        reacted: !removed,
        count,
    }))
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
) -> Result<Json<ChatMessageListResponse>, AppError> {
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
                'edited_at', m.edited_at, 'reply_to_id', m.reply_to_id,
                'encrypted', m.encrypted,
                'encryption_version', m.encryption_version,
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
                'edited_at', m.edited_at, 'reply_to_id', m.reply_to_id,
                'encrypted', m.encrypted,
                'encryption_version', m.encryption_version,
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
    let messages = messages
        .into_iter()
        .map(parse_chat_json)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(ChatMessageListResponse {
        messages,
        next_before,
    }))
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
