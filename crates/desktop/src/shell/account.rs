// Account refresh and local database status.

#[tauri::command]
async fn local_refresh_profile(state: State<'_, DesktopState>) -> Result<Value, String> {
    let user = current_user(&state)?;
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
    let response = reqwest::Client::new()
        .get(format!("{}/api/v1/me", grant.server_url))
        .header("Cookie", format!("jey_session={token}"))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err("Сервер не подтвердил сессию".to_owned());
    }
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    let profile = body
        .get("user")
        .cloned()
        .ok_or_else(|| "Сервер не вернул профиль".to_owned())?;
    state
        .store
        .save_local_profile(user, &profile)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_update_profile(state: State<'_, DesktopState>, input: Value) -> Result<Value, String> {
    let user = current_user(&state)?;
    state
        .store
        .save_local_profile(user, &input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_db_status(state: State<'_, DesktopState>) -> Result<Value, String> {
    let status = state.store.status().map_err(|error| error.to_string())?;
    serde_json::to_value(status).map_err(|error| error.to_string())
}

