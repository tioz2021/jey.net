//! Device registration for sync clients.
//!
//! The public `device_id` is the client-generated installation id; the
//! internal UUID stays private and is referenced by sessions and records.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

const PLATFORMS: &[&str] = &["linux", "macos", "windows"];

#[derive(Debug, Deserialize)]
pub struct RegisterDevice {
    pub device_id: Uuid,
    pub name: String,
    pub platform: String,
}

#[derive(Debug, FromRow)]
struct DeviceRow {
    id: Uuid,
    installation_id: Uuid,
    name: String,
    platform: String,
    created_at: chrono::DateTime<chrono::Utc>,
    last_seen_at: chrono::DateTime<chrono::Utc>,
    inserted: bool,
}

/// `POST /api/v1/devices` — register or update one installation.
pub async fn register(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(input): Json<RegisterDevice>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::validation_field(
            "name",
            "name must be between 1 and 60 characters",
        ));
    }
    if !PLATFORMS.contains(&input.platform.as_str()) {
        return Err(AppError::validation_field(
            "platform",
            "platform must be linux, macos or windows",
        ));
    }

    let device = sqlx::query_as::<_, DeviceRow>(
        "insert into devices (id, user_id, installation_id, name, platform)
         values (gen_random_uuid(), $1, $2, $3, $4)
         on conflict (user_id, installation_id) do update
           set name = excluded.name,
               platform = excluded.platform,
               last_seen_at = now()
         returning id, installation_id, name, platform, created_at, last_seen_at,
                   (xmax = 0) as inserted",
    )
    .bind(current.user.id)
    .bind(input.device_id)
    .bind(name)
    .bind(&input.platform)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;

    // A sync session belongs to exactly one installation. Re-registering the
    // same device rebinds the current session without touching other sessions.
    sqlx::query("update sessions set device_id = $1 where id = $2 and user_id = $3")
        .bind(device.id)
        .bind(current.session_id)
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;

    let status = if device.inserted {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };

    Ok((
        status,
        Json(json!({
            "device": {
                "device_id": device.installation_id,
                "name": device.name,
                "platform": device.platform,
                "created_at": device.created_at,
                "last_seen_at": device.last_seen_at,
            }
        })),
    ))
}
