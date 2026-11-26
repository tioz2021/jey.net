// Items, collections, comments, cache and sync commands.

#[tauri::command]
async fn local_list_items(
    state: State<'_, DesktopState>,
    query: Option<String>,
) -> Result<Vec<Value>, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let items = match query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(query) => repository
            .search_items(user, query)
            .map_err(|error| error.to_string())?,
        None => repository
            .list_items(user)
            .await
            .map_err(|error| error.to_string())?,
    };
    let pending = repository
        .pending_ids(user)
        .map_err(|error| error.to_string())?
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    Ok(items
        .iter()
        .map(|item| item_json(item, pending.contains(&item.id.to_string())))
        .collect())
}

#[tauri::command]
async fn local_get_item(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<Option<Value>, String> {
    let user = current_user(&state)?;
    let item_id = Uuid::parse_str(&id).map_err(|_| "invalid item id".to_owned())?;
    let repository = SqliteItems::new(state.store.clone());
    let item = repository
        .get_item(user, item_id)
        .await
        .map_err(|error| error.to_string())?;
    let pending = repository
        .pending_ids(user)
        .map_err(|error| error.to_string())?;
    Ok(item.map(|item| item_json(&item, pending.contains(&item.id.to_string()))))
}

#[tauri::command]
fn local_cache_get(state: State<'_, DesktopState>, key: String) -> Result<Option<Value>, String> {
    let user = current_user(&state)?;
    state
        .store
        .cache_get(user, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_cache_put(
    state: State<'_, DesktopState>,
    key: String,
    payload: Value,
) -> Result<(), String> {
    let user = current_user(&state)?;
    state
        .store
        .cache_put(user, &key, &payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_enqueue_social(
    state: State<'_, DesktopState>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<(), String> {
    let user = current_user(&state)?;
    state
        .store
        .enqueue_social(user, &method, &path, body.as_ref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_list_collections(state: State<'_, DesktopState>) -> Result<Value, String> {
    let user = current_user(&state)?;
    let collections = state
        .store
        .list_collections(user)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "collections": collections }))
}

#[tauri::command]
fn local_create_collection(state: State<'_, DesktopState>, input: Value) -> Result<Value, String> {
    let user = current_user(&state)?;
    let title = input
        .get("title")
        .and_then(Value::as_str)
        .ok_or_else(|| "title is required".to_owned())?;
    let collection = state
        .store
        .create_collection(user, title)
        .map_err(|error| error.to_string())?;
    serde_json::to_value(collection).map_err(|error| error.to_string())
}

#[tauri::command]
fn local_update_collection(
    state: State<'_, DesktopState>,
    id: String,
    input: Value,
) -> Result<(), String> {
    let user = current_user(&state)?;
    let title = input.get("title").and_then(Value::as_str);
    let visibility = input.get("visibility").and_then(Value::as_str);
    state
        .store
        .update_collection(user, &id, title, visibility)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_delete_collection(state: State<'_, DesktopState>, id: String) -> Result<(), String> {
    let user = current_user(&state)?;
    state
        .store
        .delete_collection(user, &id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_collection_detail(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<Value, String> {
    let user = current_user(&state)?;
    let collections = state
        .store
        .list_collections(user)
        .map_err(|error| error.to_string())?;
    let collection = collections
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "collection not found".to_owned())?;
    let ids = state
        .store
        .collection_item_ids(user, &id)
        .map_err(|error| error.to_string())?;
    let repository = SqliteItems::new(state.store.clone());
    let items = repository
        .list_items(user)
        .await
        .map_err(|error| error.to_string())?;
    let selected = items
        .iter()
        .filter(|item| ids.contains(&item.id))
        .map(|item| item_json(item, false))
        .collect::<Vec<_>>();
    Ok(json!({ "collection": collection, "items": selected }))
}

#[tauri::command]
fn local_list_comments(state: State<'_, DesktopState>, input: Value) -> Result<Value, String> {
    let user = current_user(&state)?;
    let item_id = input
        .get("itemId")
        .and_then(Value::as_str)
        .ok_or_else(|| "itemId is required".to_owned())?;
    let offset = input.get("offset").and_then(Value::as_i64).unwrap_or(0);
    let limit = input.get("limit").and_then(Value::as_i64).unwrap_or(5);
    state
        .store
        .list_comments(user, item_id, offset, limit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_create_comment(state: State<'_, DesktopState>, input: Value) -> Result<Value, String> {
    let user = current_user(&state)?;
    let item_id = input
        .get("itemId")
        .and_then(Value::as_str)
        .ok_or_else(|| "itemId is required".to_owned())?;
    let body = input
        .get("body")
        .and_then(Value::as_str)
        .ok_or_else(|| "body is required".to_owned())?;
    let parent = input.get("parentId").and_then(Value::as_str);
    let id = state
        .store
        .create_comment(user, item_id, body, parent)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
fn local_react_comment(state: State<'_, DesktopState>, id: String) -> Result<Value, String> {
    let user = current_user(&state)?;
    let (reacted, count) = state
        .store
        .toggle_comment_reaction(user, &id)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "reacted": reacted, "count": count }))
}

#[tauri::command]
fn local_delete_comment(state: State<'_, DesktopState>, id: String) -> Result<Value, String> {
    let user = current_user(&state)?;
    state
        .store
        .delete_comment(user, &id)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "deleted": true }))
}

#[tauri::command]
async fn local_search_items(
    state: State<'_, DesktopState>,
    query: String,
) -> Result<Vec<Value>, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let items = repository
        .search_items(user, &query)
        .map_err(|error| error.to_string())?;
    let pending = repository
        .pending_ids(user)
        .map_err(|error| error.to_string())?
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    Ok(items
        .iter()
        .map(|item| item_json(item, pending.contains(&item.id.to_string())))
        .collect())
}

#[tauri::command]
async fn local_create_item(
    state: State<'_, DesktopState>,
    new_item: NewItem,
) -> Result<Value, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let item = repository
        .create_item(user, None, &new_item)
        .await
        .map_err(|error| error.to_string())?;
    Ok(item_json(&item, true))
}

#[tauri::command]
async fn local_update_item(
    state: State<'_, DesktopState>,
    id: uuid::Uuid,
    patch: ItemPatch,
) -> Result<Option<Value>, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let item = repository
        .update_item(user, id, &patch)
        .await
        .map_err(|error| error.to_string())?;
    Ok(item.map(|item| item_json(&item, true)))
}

#[tauri::command]
fn local_cover_data(state: State<'_, DesktopState>, key: String) -> Result<Option<String>, String> {
    let _user = current_user(&state)?;
    let bytes = state
        .store
        .read_media(&key)
        .map_err(|error| error.to_string())?;
    let Some(bytes) = bytes else {
        return Ok(None);
    };
    let mime = if key.ends_with(".png") {
        "image/png"
    } else if key.ends_with(".jpg") || key.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/webp"
    };
    Ok(Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
}

#[tauri::command]
fn local_export_json(state: State<'_, DesktopState>) -> Result<crate::store::ExportReport, String> {
    let user = current_user(&state)?;
    export_json(&state.store, user).map_err(|error| error.to_string())
}

#[tauri::command]
fn local_backup(state: State<'_, DesktopState>) -> Result<crate::store::BackupReport, String> {
    let user = current_user(&state)?;
    backup(&state.store, user).map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_sync_status(state: State<'_, DesktopState>) -> Result<Value, String> {
    let service = SyncService::from_local(state.store.clone(), &state.access, &state.session)?;
    let status = service.status().await?;
    serde_json::to_value(status).map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_sync(state: State<'_, DesktopState>) -> Result<Value, String> {
    if state.sync_busy.swap(true, Ordering::SeqCst) {
        return Err("Синхронизация уже идёт".to_owned());
    }
    let result = async {
        let service = SyncService::from_local(state.store.clone(), &state.access, &state.session)?;
        service.synchronize().await
    }
    .await;
    state.sync_busy.store(false, Ordering::SeqCst);
    let report = result?;
    serde_json::to_value(report).map_err(|error| error.to_string())
}

