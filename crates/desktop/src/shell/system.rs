// Desktop settings, storage and system information commands.

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
    if let Ok(value) = std::env::var("XDG_DATA_HOME")
        && !value.trim().is_empty()
    {
        return Some(PathBuf::from(value).join("net.jey.desktop"));
    }
    std::env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".local/share/net.jey.desktop"))
}

fn startup_backend(default_dir: &Path) -> String {
    if let Ok(value) = std::env::var("JEY_BACKEND")
        && (value == "wayland" || value == "x11")
    {
        return value;
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
            include_bytes!("../../../../apps/web/public/notification.wav"),
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
        Err("Системный аудиоплеер не найден".to_owned())
    }
    #[cfg(target_os = "macos")]
    {
        let path = std::env::temp_dir().join("jey-notification.wav");
        std::fs::write(
            &path,
            include_bytes!("../../../../apps/web/public/notification.wav"),
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

