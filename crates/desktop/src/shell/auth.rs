// Password and Google sign-in commands.

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

