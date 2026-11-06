//! Tauri window, local library commands and first online login.

use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{Manager, State};

use jey_core::items::{Item, ItemPatch, NewItem};
use jey_core::repositories::ItemRepository;

use crate::access::AccessStore;
use crate::store::{DesktopStore, SqliteItems};

struct DesktopState {
    access: AccessStore,
    store: DesktopStore,
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

fn current_user(state: &DesktopState) -> Result<uuid::Uuid, String> {
    state
        .access
        .load()
        .map_err(|error| error.to_string())?
        .map(|grant| grant.user_id)
        .ok_or_else(|| "Сначала войдите онлайн, чтобы открыть локальную библиотеку".to_owned())
}

fn item_json(item: &Item, pending: bool) -> Value {
    json!({
        "id": item.id,
        "title": item.title,
        "kind": item.kind.as_str(),
        "status": item.status.as_str(),
        "year": item.year,
        "rating": item.rating,
        "updated_at": item.updated_at.as_millis(),
        "pending": pending,
    })
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
    title: String,
) -> Result<Option<Value>, String> {
    let user = current_user(&state)?;
    let repository = SqliteItems::new(state.store.clone());
    let item = repository
        .update_item(
            user,
            id,
            &ItemPatch {
                title: Some(title),
                ..ItemPatch::default()
            },
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(item.map(|item| item_json(&item, true)))
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory: {error}"))?;
            let store = DesktopStore::open(&data_dir)
                .map_err(|error| format!("local database: {error}"))?;
            app.manage(DesktopState {
                access: AccessStore::new(data_dir),
                store,
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
            local_list_items,
            local_create_item,
            local_update_item,
            local_delete_item,
            local_sign_in
        ])
        .run(tauri::generate_context!())
        .expect("error while running jey.net desktop");
}
