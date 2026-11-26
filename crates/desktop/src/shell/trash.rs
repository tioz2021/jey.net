// Deleted-items and trash commands.

#[tauri::command]
async fn local_delete_item(state: State<'_, DesktopState>, id: uuid::Uuid) -> Result<bool, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    repository
        .delete_item(user, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_list_deleted_items(state: State<'_, DesktopState>) -> Result<Vec<Value>, String> {
    let user = current_user(&state)?;
    state
        .store
        .deleted_items(user)
        .map(|items| items.iter().map(|item| item_json(item, false)).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_purge_item(state: State<'_, DesktopState>, id: uuid::Uuid) -> Result<bool, String> {
    let user = current_user(&state)?;
    state
        .store
        .purge_deleted(user, id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_empty_trash(state: State<'_, DesktopState>) -> Result<usize, String> {
    let user = current_user(&state)?;
    state
        .store
        .empty_deleted(user)
        .map_err(|error| error.to_string())
}

