// Local profile bootstrap and read commands.

#[tauri::command]
fn local_bootstrap_access(state: State<'_, DesktopState>) -> Result<Value, String> {
    if let Some(grant) = state.access.load().map_err(|error| error.to_string())? {
        return Ok(json!({ "user_id": grant.user_id }));
    }
    let user = uuid::Uuid::new_v4();
    let grant = state
        .access
        .grant(user, "local")
        .map_err(|error| error.to_string())?;
    Ok(json!({ "user_id": grant.user_id }))
}

#[tauri::command]
fn local_profile(state: State<'_, DesktopState>) -> Result<Value, String> {
    let user = current_user(&state)?;
    state
        .store
        .local_profile(user)
        .map_err(|error| error.to_string())
}

