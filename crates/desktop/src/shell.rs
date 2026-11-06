//! Tauri window and commands for the desktop shell.

use tauri::Manager;

#[tauri::command]
fn app_version() -> &'static str {
    jey_desktop::APP_VERSION
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("jey.net");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running jey.net desktop");
}
