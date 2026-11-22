//! Tauri window, local library commands and first online login.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{Manager, State};
use uuid::Uuid;

use jey_core::items::{Item, ItemPatch, NewItem};
use jey_core::repositories::ItemRepository;

use crate::access::AccessStore;
use crate::session_store::SessionStore;
use crate::store::{DesktopStore, SqliteItems, backup, export_json};
use crate::sync::SyncService;

struct DesktopState {
    default_dir: PathBuf,
    access: AccessStore,
    store: DesktopStore,
    session: SessionStore,
    sync_busy: Arc<AtomicBool>,
}

#[tauri::command]
fn app_version() -> &'static str {
    crate::APP_VERSION
}

/// Reads only the local grant; it never calls the server.
#[tauri::command]
fn local_access_status(state: State<'_, DesktopState>) -> Result<Value, String> {
    match state.access.load() {
        Ok(Some(grant)) => Ok(json!({
            "has_access": true,
            "user_id": grant.user_id,
            "server_url": grant.server_url,
            "granted_at": grant.granted_at,
            "last_verified_at": grant.last_verified_at,
        })),
        Ok(None) => Ok(json!({ "has_access": false })),
        Err(error) => Err(error.to_string()),
    }
}

fn storage_config_path(default_dir: &Path) -> PathBuf {
    default_dir.join("storage.json")
}

fn configured_data_dir(default_dir: &Path) -> Option<PathBuf> {
    let raw = std::fs::read_to_string(storage_config_path(default_dir)).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let path = value.get("data_dir")?.as_str()?;
    let path = PathBuf::from(path);
    path.is_dir().then_some(path)
}

fn storage_config(default_dir: &Path) -> Value {
    std::fs::read_to_string(storage_config_path(default_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_storage_config(default_dir: &Path, value: &Value) -> Result<(), String> {
    std::fs::create_dir_all(default_dir).map_err(|error| error.to_string())?;
    std::fs::write(storage_config_path(default_dir), value.to_string())
        .map_err(|error| error.to_string())
}

fn gpu_acceleration_enabled(default_dir: &Path) -> bool {
    storage_config(default_dir)
        .get("gpu_acceleration")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn save_data_dir(default_dir: &Path, path: &Path) -> Result<(), String> {
    let mut value = storage_config(default_dir);
    value["data_dir"] = json!(path);
    write_storage_config(default_dir, &value)
}

fn app_data_candidate() -> Option<PathBuf> {
    if let Ok(value) = std::env::var("XDG_DATA_HOME") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value).join("net.jey.desktop"));
        }
    }
    std::env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".local/share/net.jey.desktop"))
}

fn startup_backend(default_dir: &Path) -> String {
    if let Ok(value) = std::env::var("JEY_BACKEND") {
        if value == "wayland" || value == "x11" {
            return value;
        }
    }
    storage_config(default_dir)
        .get("backend")
        .and_then(Value::as_str)
        .filter(|value| *value == "x11" || *value == "wayland")
        .unwrap_or("x11")
        .to_owned()
}

fn apply_startup_backend_setting() {
    if std::env::var_os("GDK_BACKEND").is_some() {
        return;
    }
    let backend = app_data_candidate()
        .map(|dir| startup_backend(&dir))
        .unwrap_or_else(|| "x11".to_owned());
    // SAFETY: called once before GTK/WebKit initializes.
    unsafe {
        std::env::set_var(
            "GDK_BACKEND",
            if backend == "wayland" {
                "wayland"
            } else {
                "x11,wayland"
            },
        );
    }
}

/// Startup-only compatibility switch. WebKitGTK reads these variables when it
/// creates the web process, so they must be set before Tauri builds the window.
/// `JEY_SAFE_MODE=1` is the recovery path for a bad GPU/driver combination.
fn apply_startup_gpu_setting() {
    if std::env::var("JEY_SAFE_MODE").as_deref() == Ok("1") {
        return;
    }
    let enabled = app_data_candidate()
        .map(|dir| gpu_acceleration_enabled(&dir))
        .unwrap_or(true);
    #[cfg(target_os = "linux")]
    if enabled {
        // SAFETY: called once before any worker/webview thread is started.
        unsafe {
            std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");
            std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
        }
    } else {
        // SAFETY: called once before any worker/webview thread is started.
        unsafe {
            std::env::remove_var("WEBKIT_FORCE_COMPOSITING_MODE");
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    #[cfg(target_os = "windows")]
    if !enabled {
        // SAFETY: called once before the WebView2 environment is created.
        unsafe {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu");
        }
    }
    let _ = enabled;
}

#[tauri::command]
fn local_test_sound() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let path = std::env::temp_dir().join("jey-notification.wav");
        std::fs::write(
            &path,
            include_bytes!("../../../apps/web/public/notification.wav"),
        )
        .map_err(|error| error.to_string())?;
        let candidates: [(&str, &[&str]); 4] = [
            ("paplay", &[]),
            ("pw-play", &[]),
            ("aplay", &["-q"]),
            ("canberra-gtk-play", &["-f"]),
        ];
        for (program, args) in candidates {
            if std::process::Command::new(program)
                .args(args)
                .arg(&path)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
        return Err("Системный аудиоплеер не найден".to_owned());
    }
    #[cfg(target_os = "macos")]
    {
        let path = std::env::temp_dir().join("jey-notification.wav");
        std::fs::write(
            &path,
            include_bytes!("../../../apps/web/public/notification.wav"),
        )
        .map_err(|error| error.to_string())?;
        std::process::Command::new("afplay")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Err("Звук недоступен на этой платформе".to_owned())
    }
}

#[tauri::command]
async fn local_latest_release() -> Result<Value, String> {
    let url = std::env::var("JEY_RELEASE_URL")
        .unwrap_or_else(|_| "https://j3ynet.site/downloads/desktop/latest.json".to_owned());
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Сервер обновлений недоступен: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Сервер обновлений ответил {}", response.status()));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|error| format!("Некорректный latest.json: {error}"))?;
    Ok(body)
}

#[tauri::command]
fn local_open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Разрешены только http(s)-ссылки".to_owned());
    }
    webbrowser::open(&url)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_storage_info(state: State<'_, DesktopState>) -> Result<Value, String> {
    let current = state.store.path().parent().unwrap_or(Path::new("."));
    Ok(json!({ "data_dir": current, "default_dir": state.default_dir }))
}

#[tauri::command]
fn local_gpu_info(state: State<'_, DesktopState>) -> Result<Value, String> {
    Ok(json!({
        "enabled": gpu_acceleration_enabled(&state.default_dir),
        "restart_required": false,
    }))
}

#[tauri::command]
fn local_backend_info(state: State<'_, DesktopState>) -> Result<Value, String> {
    Ok(json!({ "backend": startup_backend(&state.default_dir) }))
}

#[tauri::command]
fn local_set_backend(state: State<'_, DesktopState>, backend: String) -> Result<Value, String> {
    if backend != "x11" && backend != "wayland" {
        return Err("backend must be x11 or wayland".to_owned());
    }
    let mut value = storage_config(&state.default_dir);
    value["backend"] = json!(backend);
    write_storage_config(&state.default_dir, &value)?;
    Ok(json!({ "backend": backend, "restart_required": true }))
}

#[tauri::command]
fn local_set_gpu_acceleration(
    state: State<'_, DesktopState>,
    enabled: bool,
) -> Result<Value, String> {
    let mut value = storage_config(&state.default_dir);
    value["gpu_acceleration"] = json!(enabled);
    write_storage_config(&state.default_dir, &value)?;
    Ok(json!({ "enabled": enabled, "restart_required": true }))
}

#[tauri::command]
fn local_choose_data_dir(state: State<'_, DesktopState>) -> Result<Value, String> {
    let Some(target) = rfd::FileDialog::new()
        .set_title("Папка данных jey.net")
        .pick_folder()
    else {
        return Ok(json!({ "cancelled": true }));
    };
    let current = state.store.path().parent().unwrap_or(Path::new("."));
    if target == current {
        return Ok(json!({ "data_dir": current, "restart": false }));
    }
    if target.join("jey.db").exists() {
        return Err("В выбранной папке уже есть локальная база jey.net".to_owned());
    }
    state
        .store
        .copy_to(&target)
        .map_err(|error| error.to_string())?;
    save_data_dir(&state.default_dir, &target)?;
    Ok(json!({ "data_dir": target, "restart": true }))
}

#[tauri::command]
fn local_use_default_data_dir(state: State<'_, DesktopState>) -> Result<(), String> {
    let mut value = storage_config(&state.default_dir);
    if let Some(object) = value.as_object_mut() {
        object.remove("data_dir");
    }
    write_storage_config(&state.default_dir, &value)
}

fn current_user(state: &DesktopState) -> Result<uuid::Uuid, String> {
    state
        .access
        .load()
        .map_err(|error| error.to_string())?
        .map(|grant| grant.user_id)
        .ok_or_else(|| "Сначала войдите онлайн, чтобы открыть локальную библиотеку".to_owned())
}

fn item_json(item: &Item, pending: bool) -> Value {
    let mut value = serde_json::to_value(item).unwrap_or(Value::Null);
    if let Some(object) = value.as_object_mut() {
        object.insert("pending".to_owned(), Value::Bool(pending));
    }
    value
}

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
    title: Option<String>,
    status: Option<String>,
    rating: Option<u8>,
    review: Option<String>,
) -> Result<Option<Value>, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let status = status
        .map(|value| jey_core::items::ItemStatus::parse(&value))
        .transpose()
        .map_err(|error| error.to_string())?;
    let item = repository
        .update_item(
            user,
            id,
            &ItemPatch {
                title,
                status,
                rating,
                review,
                ..ItemPatch::default()
            },
        )
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

#[tauri::command]
async fn local_delete_item(state: State<'_, DesktopState>, id: uuid::Uuid) -> Result<bool, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    repository
        .delete_item(user, id)
        .await
        .map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct LoginInput {
    server_url: String,
    email: String,
    password: String,
}

#[tauri::command]
async fn local_sign_in(state: State<'_, DesktopState>, input: LoginInput) -> Result<Value, String> {
    let server = input.server_url.trim().trim_end_matches('/').to_owned();
    if server.is_empty() {
        return Err("Укажите адрес сервера".to_owned());
    }
    let response = reqwest::Client::new()
        .post(format!("{server}/api/v1/auth/login"))
        .header("Origin", &server)
        .json(&serde_json::json!({
            "email": input.email,
            "password": input.password,
        }))
        .send()
        .await
        .map_err(|error| format!("Сервер недоступен: {error}"))?;
    let status = response.status();
    let session_cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .find_map(|value| {
            value
                .to_str()
                .ok()
                .and_then(|raw| raw.split(';').next())
                .and_then(|pair| pair.strip_prefix("jey_session="))
                .map(str::to_owned)
        });
    let body: Value = response
        .json()
        .await
        .map_err(|error| format!("Некорректный ответ сервера: {error}"))?;
    if !status.is_success() {
        return Err(body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Не удалось войти")
            .to_owned());
    }
    if let Some(cookie) = session_cookie {
        let _ = state.session.save(&cookie);
    }
    let user_id = body
        .pointer("/user/id")
        .and_then(Value::as_str)
        .and_then(|value| uuid::Uuid::parse_str(value).ok())
        .ok_or_else(|| "Сервер не вернул пользователя".to_owned())?;
    state
        .access
        .grant(user_id, &server)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "has_access": true, "user_id": user_id, "server_url": server }))
}

#[tauri::command]
fn local_sign_out(state: State<'_, DesktopState>) -> Result<(), String> {
    state.access.revoke().map_err(|error| error.to_string())?;
    state.session.clear().map_err(|error| error.to_string())?;
    state
        .store
        .clear_chat_data()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct GoogleLoginInput {
    server_url: String,
}

fn random_urlsafe(bytes: usize) -> String {
    use rand::RngCore;
    let mut value = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

/// Opens Google in the system browser, waits on a loopback listener and
/// exchanges the one-time code plus PKCE verifier for a session token.
#[tauri::command]
async fn local_google_sign_in(
    state: State<'_, DesktopState>,
    input: GoogleLoginInput,
) -> Result<Value, String> {
    let server = input.server_url.trim().trim_end_matches('/').to_owned();
    if server.is_empty() {
        return Err("Укажите адрес сервера".to_owned());
    }
    let listener = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|error| format!("Не удалось открыть loopback: {error}"))?;
    let port = match listener.server_addr() {
        tiny_http::ListenAddr::IP(address) => address.port(),
        _ => return Err("Не удалось определить loopback-порт".to_owned()),
    };
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let state_token = format!("{:x}", uuid::Uuid::new_v4().as_u128())
        + &format!("{:x}", uuid::Uuid::new_v4().as_u128());
    let verifier = random_urlsafe(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let mut start = reqwest::Url::parse(&format!("{server}/api/v1/auth/google/desktop/start"))
        .map_err(|error| format!("Некорректный адрес сервера: {error}"))?;
    start
        .query_pairs_mut()
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("code_challenge", &challenge)
        .append_pair("state", &state_token);
    webbrowser::open(start.as_str())
        .map_err(|error| format!("Не удалось открыть браузер: {error}"))?;

    let expected_state = state_token.clone();
    let (sender, receiver) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(300);
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                let _ = sender.send(Err("Время ожидания Google истекло".to_owned()));
                return;
            }
            match listener.recv_timeout(remaining.min(Duration::from_millis(500))) {
                Ok(Some(request)) => {
                    let url =
                        reqwest::Url::parse(&format!("http://127.0.0.1:{port}{}", request.url()));
                    let result = match url {
                        Ok(url) => {
                            let code = url
                                .query_pairs()
                                .find(|(key, _)| key == "code")
                                .map(|(_, value)| value.to_string());
                            let state = url
                                .query_pairs()
                                .find(|(key, _)| key == "state")
                                .map(|(_, value)| value.to_string());
                            let error = url
                                .query_pairs()
                                .find(|(key, _)| key == "error")
                                .map(|(_, value)| value.to_string());
                            match (code, state, error) {
                                (Some(code), Some(state), _) if state == expected_state => Ok(code),
                                (_, _, Some(error)) => Err(format!("Google: {error}")),
                                (Some(_), _, _) => Err("Неверный state OAuth".to_owned()),
                                _ => Err("Google не вернул код".to_owned()),
                            }
                        }
                        Err(error) => Err(format!("Некорректный callback: {error}")),
                    };
                    let _ = request.respond(tiny_http::Response::from_string(
                        "<!doctype html><meta charset=utf-8><title>jey.net</title>                         <p>Вход завершён. Вернитесь в приложение jey.net.</p>",
                    ));
                    let _ = sender.send(result);
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = sender.send(Err(format!("Loopback: {error}")));
                    return;
                }
            }
        }
    });

    let code = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(300))
            .map_err(|_| "Время ожидания Google истекло".to_owned())?
    })
    .await
    .map_err(|error| format!("Ожидание Google: {error}"))??;

    let exchange = reqwest::Client::new()
        .post(format!("{server}/api/v1/auth/google/desktop/exchange"))
        .header("Origin", &server)
        .json(&json!({ "code": code, "code_verifier": verifier }))
        .send()
        .await
        .map_err(|error| format!("Сервер недоступен: {error}"))?;
    let status = exchange.status();
    let body: Value = exchange
        .json()
        .await
        .map_err(|error| format!("Некорректный ответ сервера: {error}"))?;
    if !status.is_success() {
        return Err(body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Не удалось обменять Google-код")
            .to_owned());
    }
    let user_id = body
        .pointer("/user/id")
        .and_then(Value::as_str)
        .and_then(|value| uuid::Uuid::parse_str(value).ok())
        .ok_or_else(|| "Сервер не вернул пользователя".to_owned())?;
    let token = body
        .get("token")
        .and_then(Value::as_str)
        .ok_or_else(|| "Сервер не вернул сессию".to_owned())?;
    state
        .session
        .save(token)
        .map_err(|error| error.to_string())?;
    state
        .access
        .grant(user_id, &server)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "has_access": true, "user_id": user_id, "server_url": server }))
}

pub fn run() {
    apply_startup_backend_setting();
    apply_startup_gpu_setting();
    tauri::Builder::default()
        .setup(|app| {
            let default_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory: {error}"))?;
            let data_dir = configured_data_dir(&default_dir).unwrap_or_else(|| default_dir.clone());
            let store = DesktopStore::open(&data_dir)
                .map_err(|error| format!("local database: {error}"))?;
            app.manage(DesktopState {
                default_dir,
                access: AccessStore::new(data_dir.clone()),
                store,
                session: SessionStore::new(data_dir),
                sync_busy: Arc::new(AtomicBool::new(false)),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("jey.net");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            local_access_status,
            local_db_status,
            local_open_external,
            local_latest_release,
            local_test_sound,
            local_storage_info,
            local_gpu_info,
            local_set_gpu_acceleration,
            local_backend_info,
            local_set_backend,
            local_choose_data_dir,
            local_use_default_data_dir,
            local_list_items,
            local_get_item,
            local_search_items,
            local_cache_get,
            local_cache_put,
            local_enqueue_social,
            local_list_collections,
            local_create_collection,
            local_update_collection,
            local_delete_collection,
            local_collection_detail,
            local_bootstrap_access,
            local_proxy,
            local_refresh_profile,
            local_profile,
            local_update_profile,
            local_list_comments,
            local_create_comment,
            local_delete_comment,
            local_react_comment,
            local_create_item,
            local_update_item,
            local_delete_item,
            local_export_json,
            local_backup,
            local_cover_data,
            local_sign_in,
            local_google_sign_in,
            local_sign_out,
            local_sync,
            local_sync_status,
            local_chat_unread,
            local_chat_threads,
            local_chat_thread,
            local_chat_messages,
            local_chat_send,
            local_chat_read,
            local_chat_mute,
            local_chat_user_devices,
            local_chat_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running jey.net desktop");
}
