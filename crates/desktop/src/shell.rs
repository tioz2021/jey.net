//! Tauri window and commands for the desktop shell.

use tauri::{Manager, State};

use crate::access::AccessStore;
use crate::store::DesktopStore;

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
fn local_access_status(state: State<'_, DesktopState>) -> Result<serde_json::Value, String> {
    match state.access.load() {
        Ok(Some(grant)) => Ok(serde_json::json!({
            "has_access": true,
            "user_id": grant.user_id,
            "server_url": grant.server_url,
            "granted_at": grant.granted_at,
            "last_verified_at": grant.last_verified_at,
        })),
        Ok(None) => Ok(serde_json::json!({ "has_access": false })),
        Err(error) => Err(error.to_string()),
    }
}

/// Path, schema version and sync queue counters for the local database.
#[tauri::command]
fn local_db_status(state: State<'_, DesktopState>) -> Result<serde_json::Value, String> {
    let status = state.store.status().map_err(|error| error.to_string())?;
    serde_json::to_value(status).map_err(|error| error.to_string())
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
        .invoke_handler(tauri::generate_handler![app_version, local_access_status])
        .run(tauri::generate_context!())
        .expect("error while running jey.net desktop");
}
