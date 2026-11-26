// Desktop chat commands and outbox flushing.

#[derive(Debug)]
enum ChatRemoteError {
    Offline,
    Status(u16, String),
    Invalid(String),
}

async fn chat_remote(
    state: &DesktopState,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, ChatRemoteError> {
    let grant = state
        .access
        .load()
        .map_err(|error| ChatRemoteError::Invalid(error.to_string()))?
        .ok_or(ChatRemoteError::Offline)?;
    let token = state
        .session
        .load()
        .map_err(|error| ChatRemoteError::Invalid(error.to_string()))?
        .ok_or(ChatRemoteError::Offline)?;
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|error| ChatRemoteError::Invalid(error.to_string()))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| ChatRemoteError::Invalid(error.to_string()))?;
    let mut request = client
        .request(method, format!("{}{}", grant.server_url, path))
        .header("Origin", &grant.server_url)
        .header("Cookie", format!("jey_session={token}"));
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.map_err(|_| ChatRemoteError::Offline)?;
    let status = response.status().as_u16();
    let bytes = response
        .bytes()
        .await
        .map_err(|_| ChatRemoteError::Offline)?;
    if !(200..300).contains(&status) {
        let message = serde_json::from_slice::<Value>(&bytes)
            .ok()
            .and_then(|value| {
                value
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| "Сервер отклонил запрос".to_owned());
        return Err(ChatRemoteError::Status(status, message));
    }
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn flush_chat_outbox(state: &DesktopState) -> Result<usize, String> {
    let rows = state
        .store
        .chat_outbox()
        .map_err(|error| error.to_string())?;
    let mut sent = 0;
    for row in rows {
        let payload = match row.encrypted.as_deref() {
            Some(raw) => {
                let encrypted: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
                json!({ "client_id": row.client_id, "encrypted": encrypted })
            }
            None => json!({ "body": row.body, "client_id": row.client_id }),
        };
        match chat_remote(
            state,
            "POST",
            &format!("/api/v1/chat/threads/{}/messages", row.thread_id),
            Some(payload),
        )
        .await
        {
            Ok(value) => {
                if let Some(message) = value.get("message") {
                    let _ = state.store.save_chat_message(message, false);
                }
                state
                    .store
                    .clear_chat_outbox(&row.client_id)
                    .map_err(|error| error.to_string())?;
                sent += 1;
            }
            Err(ChatRemoteError::Status(409, _)) => {
                // Idempotent replay with a different body must not loop forever.
                state
                    .store
                    .clear_chat_outbox(&row.client_id)
                    .map_err(|error| error.to_string())?;
            }
            Err(ChatRemoteError::Status(_, _)) | Err(ChatRemoteError::Offline) => break,
            Err(ChatRemoteError::Invalid(error)) => return Err(error),
        }
    }
    Ok(sent)
}

#[tauri::command]
fn local_chat_unread(state: State<'_, DesktopState>) -> Result<Value, String> {
    Ok(json!({ "unread": state.store.chat_unread().map_err(|error| error.to_string())? }))
}

#[tauri::command]
async fn local_chat_threads(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _ = flush_chat_outbox(&state).await;
    match chat_remote(&state, "GET", "/api/v1/chat/threads", None).await {
        Ok(value) => {
            state
                .store
                .cache_chat_threads(&value)
                .map_err(|error| error.to_string())?;
            Ok(value)
        }
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => state
            .store
            .list_chat_threads()
            .map_err(|error| error.to_string()),
    }
}

#[tauri::command]
async fn local_chat_thread(
    state: State<'_, DesktopState>,
    thread_id: String,
) -> Result<Value, String> {
    match chat_remote(
        &state,
        "GET",
        &format!("/api/v1/chat/threads/{thread_id}"),
        None,
    )
    .await
    {
        Ok(value) => {
            if let Some(thread) = value.get("thread") {
                state
                    .store
                    .save_chat_thread(thread)
                    .map_err(|error| error.to_string())?;
            }
            Ok(value)
        }
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => state
            .store
            .get_chat_thread(&thread_id)
            .map_err(|error| error.to_string())?
            .map(|thread| json!({ "thread": thread }))
            .ok_or_else(|| "Диалог недоступен офлайн".to_owned()),
    }
}

#[tauri::command]
async fn local_chat_messages(
    state: State<'_, DesktopState>,
    thread_id: String,
    before: Option<String>,
    limit: Option<i64>,
) -> Result<Value, String> {
    let limit = limit.unwrap_or(50).clamp(1, 100);
    let _ = flush_chat_outbox(&state).await;
    let mut path = format!("/api/v1/chat/threads/{thread_id}/messages?limit={limit}");
    if let Some(before) = before.as_deref() {
        path.push_str("&before=");
        path.push_str(before);
    }
    match chat_remote(&state, "GET", &path, None).await {
        Ok(value) => {
            state
                .store
                .cache_chat_messages(&value)
                .map_err(|error| error.to_string())?;
            Ok(value)
        }
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => state
            .store
            .list_chat_messages(&thread_id, before.as_deref(), limit)
            .map_err(|error| error.to_string()),
    }
}

#[tauri::command]
async fn local_chat_send(
    state: State<'_, DesktopState>,
    thread_id: String,
    body: Option<String>,
    client_id: String,
    encrypted: Option<Value>,
) -> Result<Value, String> {
    let user = current_user(&state)?;
    let body = body.unwrap_or_default().trim().to_owned();
    if encrypted.is_none() {
        if body.is_empty() {
            return Err("Сообщение не может быть пустым".to_owned());
        }
        if body.chars().count() > 4000 {
            return Err("Сообщение длиннее 4000 символов".to_owned());
        }
    }
    if !state
        .store
        .chat_thread_exists(&thread_id)
        .map_err(|error| error.to_string())?
    {
        return Err("Диалог недоступен офлайн".to_owned());
    }
    let _ = flush_chat_outbox(&state).await;
    match chat_remote(
        &state,
        "POST",
        &format!("/api/v1/chat/threads/{thread_id}/messages"),
        Some(match encrypted.as_ref() {
            Some(envelope) => json!({ "client_id": client_id, "encrypted": envelope }),
            None => json!({ "body": body, "client_id": client_id }),
        }),
    )
    .await
    {
        Ok(value) => {
            if let Some(message) = value.get("message") {
                state
                    .store
                    .save_chat_message(message, false)
                    .map_err(|error| error.to_string())?;
            }
            Ok(
                json!({ "message": value.get("message").cloned().unwrap_or(Value::Null), "created": true }),
            )
        }
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => {
            let message = state
                .store
                .queue_chat_message(
                    &thread_id,
                    &user.to_string(),
                    &body,
                    &client_id,
                    encrypted.as_ref(),
                )
                .map_err(|error| error.to_string())?;
            Ok(json!({ "message": message, "created": true, "pending": true }))
        }
    }
}

#[tauri::command]
async fn local_chat_read(
    state: State<'_, DesktopState>,
    thread_id: String,
) -> Result<Value, String> {
    let result = chat_remote(
        &state,
        "POST",
        &format!("/api/v1/chat/threads/{thread_id}/read"),
        Some(json!({})),
    )
    .await;
    if !matches!(result, Err(ChatRemoteError::Status(_, _))) {
        state
            .store
            .mark_chat_read(&thread_id)
            .map_err(|error| error.to_string())?;
    }
    match result {
        Ok(value) => Ok(value),
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => Ok(json!({ "read": true })),
    }
}

#[tauri::command]
async fn local_chat_mute(
    state: State<'_, DesktopState>,
    thread_id: String,
    muted: bool,
) -> Result<Value, String> {
    let method = if muted { "POST" } else { "DELETE" };
    let result = chat_remote(
        &state,
        method,
        &format!("/api/v1/chat/threads/{thread_id}/mute"),
        (muted).then(|| json!({})),
    )
    .await;
    if !matches!(result, Err(ChatRemoteError::Status(_, _))) {
        state
            .store
            .set_chat_muted(&thread_id, muted)
            .map_err(|error| error.to_string())?;
    }
    match result {
        Ok(value) => Ok(value),
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => Ok(json!({ "muted": muted })),
    }
}

#[tauri::command]
async fn local_chat_user_devices(
    state: State<'_, DesktopState>,
    user_id: String,
) -> Result<Value, String> {
    let path = format!("/api/v1/chat/users/{user_id}/devices");
    match chat_remote(&state, "GET", &path, None).await {
        Ok(value) => {
            state
                .store
                .cache_chat_devices(&user_id, &value)
                .map_err(|error| error.to_string())?;
            Ok(value)
        }
        Err(ChatRemoteError::Status(code, message)) => Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => Err(message),
        Err(ChatRemoteError::Offline) => state
            .store
            .list_chat_devices(&user_id)
            .map_err(|error| error.to_string()),
    }
}

#[tauri::command]
async fn local_chat_sync(state: State<'_, DesktopState>) -> Result<Value, String> {
    let pushed = flush_chat_outbox(&state).await?;
    let threads = chat_remote(&state, "GET", "/api/v1/chat/threads", None).await;
    let thread_count = match threads {
        Ok(value) => {
            state
                .store
                .cache_chat_threads(&value)
                .map_err(|error| error.to_string())?;
            value
                .get("threads")
                .and_then(Value::as_array)
                .map(|threads| threads.len())
                .unwrap_or(0)
        }
        Err(ChatRemoteError::Status(code, message)) => return Err(format!("{code}: {message}")),
        Err(ChatRemoteError::Invalid(message)) => return Err(message),
        Err(ChatRemoteError::Offline) => 0,
    };
    Ok(
        json!({ "pushed": pushed, "threads": thread_count, "unread": state.store.chat_unread().map_err(|error| error.to_string())? }),
    )
}

