// Remote proxy and notification SSE bridge.

#[tauri::command]
async fn local_proxy(
    state: State<'_, DesktopState>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    if !path.starts_with("/api/v1/") {
        return Err("Недопустимый путь".to_owned());
    }
    let grant = state
        .access
        .load()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Нет доступа".to_owned())?;
    let token = state
        .session
        .load()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Нет сессии".to_owned())?;
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let mut request = reqwest::Client::new()
        .request(method, format!("{}{}", grant.server_url, path))
        .header("Origin", &grant.server_url)
        .header("Cookie", format!("jey_session={token}"));
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    Ok(json!({ "status": status, "body": value }))
}

#[tauri::command]
async fn local_notification_stream_start(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    let grant = state
        .access
        .load()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Нет доступа".to_owned())?;
    let token = state
        .session
        .load()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Нет сессии".to_owned())?;
    let url = format!("{}/api/v1/notifications/stream", grant.server_url);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;

    // Fail fast if the session is no longer valid. Reconnects below handle
    // transient network failures without blocking the UI.
    let response = client
        .get(&url)
        .header("Origin", &grant.server_url)
        .header("Cookie", format!("jey_session={token}"))
        .send()
        .await
        .map_err(|error| format!("SSE: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("SSE: HTTP {}", response.status()));
    }

    let old = state
        .notification_task
        .lock()
        .map_err(|_| "SSE lock poisoned".to_owned())?
        .take();
    if let Some(old) = old {
        old.abort();
    }

    let app = app.clone();
    let server_url = grant.server_url.clone();
    let task = tokio::spawn(async move {
        let mut buffer = String::new();
        loop {
            let response = client
                .get(&url)
                .header("Origin", &server_url)
                .header("Cookie", format!("jey_session={token}"))
                .send()
                .await;
            let Ok(response) = response else {
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            };
            if !response.status().is_success() {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let Ok(chunk) = chunk else { break };
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(newline) = buffer.find('\n') {
                    let line = buffer[..newline].trim_end_matches('\r').to_owned();
                    buffer.drain(..=newline);
                    if line.starts_with("data:") {
                        let _ = app.emit("jey:notification", ());
                    }
                }
            }
            buffer.clear();
            // The connection dropped. The next attempt also acts as the
            // resync signal for the webview.
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
    *state
        .notification_task
        .lock()
        .map_err(|_| "SSE lock poisoned".to_owned())? = Some(task);
    Ok(())
}

#[tauri::command]
fn local_notification_stream_stop(state: State<'_, DesktopState>) -> Result<(), String> {
    if let Some(task) = state
        .notification_task
        .lock()
        .map_err(|_| "SSE lock poisoned".to_owned())?
        .take()
    {
        task.abort();
    }
    Ok(())
}

