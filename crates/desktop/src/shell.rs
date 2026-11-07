//! Tauri window, local library commands and first online login.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{Manager, State};

use jey_core::items::{Item, ItemPatch, NewItem};
use jey_core::repositories::ItemRepository;

use crate::access::AccessStore;
use crate::session_store::SessionStore;
use crate::store::{DesktopStore, SqliteItems, backup, export_json};
use crate::sync::SyncService;

struct DesktopState {
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
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory: {error}"))?;
            let store = DesktopStore::open(&data_dir)
                .map_err(|error| format!("local database: {error}"))?;
            app.manage(DesktopState {
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
            local_list_items,
            local_search_items,
            local_list_collections,
            local_create_collection,
            local_update_collection,
            local_delete_collection,
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
            local_sync_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running jey.net desktop");
}
