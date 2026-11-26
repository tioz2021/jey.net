//! Tauri window, local library commands and first online login.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager, State};
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
    notification_task: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

include!("shell/system.rs");
include!("shell/common.rs");
include!("shell/profile.rs");
include!("shell/network.rs");
include!("shell/account.rs");
include!("shell/items.rs");
include!("shell/chat.rs");
include!("shell/trash.rs");
include!("shell/auth.rs");

pub fn run() {
    apply_startup_backend_setting();
    apply_startup_gpu_setting();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
                notification_task: Arc::new(std::sync::Mutex::new(None)),
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
            local_notification_stream_start,
            local_notification_stream_stop,
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
            local_list_deleted_items,
            local_purge_item,
            local_empty_trash,
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
