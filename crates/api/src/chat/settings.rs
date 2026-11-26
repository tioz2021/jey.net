// Chat settings and encrypted-device handlers.

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatSettingsView {
    #[ts(type = "\"all\" | \"following\" | \"nobody\"")]
    pub message_policy: String,
}

#[derive(Debug, Serialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ChatDeviceView {
    pub device_id: Uuid,
    pub public_key: String,
    #[ts(type = "\"x25519\"")]
    pub algorithm: String,
    pub name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatDeviceListResponse {
    pub devices: Vec<ChatDeviceView>,
}

#[derive(Debug, Deserialize)]
pub struct ChatSettingsPatch {
    pub message_policy: String,
}

fn valid_policy(value: &str) -> bool {
    matches!(value, "all" | "following" | "nobody")
}

/// `GET /api/v1/chat/settings`
pub async fn get_settings(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<ChatSettingsView>, AppError> {
    let policy: String = sqlx::query_scalar(
        "select coalesce(
            (select message_policy from chat_settings where user_id = $1),
            'all'
         )",
    )
    .bind(current.user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(ChatSettingsView {
        message_policy: policy,
    }))
}

/// `PATCH /api/v1/chat/settings`
pub async fn update_settings(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<ChatSettingsPatch>,
) -> Result<Json<ChatSettingsView>, AppError> {
    if !valid_policy(&payload.message_policy) {
        return Err(AppError::validation_field(
            "message_policy",
            "message_policy must be all, following or nobody",
        ));
    }
    sqlx::query(
        "insert into chat_settings (user_id, message_policy)
         values ($1, $2)
         on conflict (user_id) do update
         set message_policy = excluded.message_policy",
    )
    .bind(current.user.id)
    .bind(&payload.message_policy)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(ChatSettingsView {
        message_policy: payload.message_policy,
    }))
}

#[derive(Debug, Deserialize)]
pub struct NewDevice {
    pub device_id: Uuid,
    pub public_key: String,
    pub name: Option<String>,
}

fn validate_public_key(raw: &str) -> Result<(), AppError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw.trim())
        .map_err(|_| AppError::validation_field("public_key", "public_key must be base64"))?;
    if bytes.len() != 32 {
        return Err(AppError::validation_field(
            "public_key",
            "x25519 public_key must be 32 bytes",
        ));
    }
    Ok(())
}

async fn device_list(pool: &PgPool, user_id: Uuid) -> Result<ChatDeviceListResponse, AppError> {
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from users where id = $1 and deleted_at is null)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if !exists {
        return Err(AppError::not_found("user"));
    }
    let devices = sqlx::query_as::<_, ChatDeviceView>(
        "select device_id, public_key, algorithm, name, created_at, updated_at
         from chat_devices
         where user_id = $1 and revoked_at is null
         order by updated_at desc
         limit 50",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)?;
    Ok(ChatDeviceListResponse { devices })
}

/// `GET /api/v1/chat/devices` — public keys of the current account's devices.
pub async fn my_devices(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<ChatDeviceListResponse>, AppError> {
    Ok(Json(device_list(&state.pool, current.user.id).await?))
}

/// `POST /api/v1/chat/devices` — register or rotate a public device key.
pub async fn register_device(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<NewDevice>,
) -> Result<Json<Value>, AppError> {
    validate_public_key(&payload.public_key)?;
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if name.is_some_and(|value| value.chars().count() > 80) {
        return Err(AppError::validation_field(
            "name",
            "device name is too long",
        ));
    }
    sqlx::query(
        "insert into chat_devices (user_id, device_id, public_key, name)
         values ($1, $2, $3, $4)
         on conflict (user_id, device_id) do update set
            public_key = excluded.public_key,
            name = excluded.name,
            revoked_at = null,
            updated_at = now()",
    )
    .bind(current.user.id)
    .bind(payload.device_id)
    .bind(payload.public_key.trim())
    .bind(name)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "registered": true })))
}

/// `GET /api/v1/chat/users/{id}/devices` — recipient public keys for encryption.
pub async fn user_devices(
    State(state): State<AppState>,
    _current: CurrentUser,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ChatDeviceListResponse>, AppError> {
    Ok(Json(device_list(&state.pool, user_id).await?))
}

/// `DELETE /api/v1/chat/devices/{device_id}` — revoke one of my devices.
pub async fn revoke_device(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update chat_devices set revoked_at = now(), updated_at = now()
         where user_id = $1 and device_id = $2 and revoked_at is null",
    )
    .bind(current.user.id)
    .bind(device_id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("device"));
    }
    Ok(Json(json!({ "revoked": true })))
}
