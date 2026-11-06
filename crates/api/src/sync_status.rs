//! `GET /api/v1/sync/status` — cheap "is there anything new?" probe.
//!
//! `changes_after` counts actual item rows after `since`, not just the
//! difference between sequence numbers: hard-purged rows leave gaps, and a
//! status response must agree with what the next pull will return.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

const PROTOCOL_VERSION: i64 = 1;

#[derive(Debug, Deserialize)]
pub struct StatusQuery {
    pub since: Option<i64>,
}

fn check_version(headers: &HeaderMap) -> Result<(), AppError> {
    let version = headers
        .get("x-sync-version")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::validation_field("X-Sync-Version", "sync version is required"))?;
    if version != "1" {
        return Err(AppError::validation_field(
            "X-Sync-Version",
            "unsupported sync version",
        ));
    }
    Ok(())
}

fn device_header(headers: &HeaderMap) -> Result<Uuid, AppError> {
    headers
        .get("x-device-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| AppError::validation_field("X-Device-Id", "X-Device-Id must be a UUID"))
}

pub async fn status(
    State(state): State<AppState>,
    current: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<StatusQuery>,
) -> Result<Json<Value>, AppError> {
    check_version(&headers)?;
    let external_device = device_header(&headers)?;
    let since = query.since.unwrap_or(0);
    if since < 0 {
        return Err(AppError::validation_field(
            "since",
            "since must not be negative",
        ));
    }

    let device_internal: Option<Uuid> =
        sqlx::query_scalar("select id from devices where user_id = $1 and installation_id = $2")
            .bind(current.user.id)
            .bind(external_device)
            .fetch_optional(&state.pool)
            .await
            .map_err(AppError::internal)?;
    let Some(device_internal) = device_internal else {
        return Err(AppError::validation_field("X-Device-Id", "unknown_device"));
    };

    let (last_seq, changes_after): (i64, i64) = sqlx::query_as(
        "select u.sync_seq,
                (select count(*) from items i
                 where i.user_id = u.id and i.sync_seq > $2)
         from users u where u.id = $1",
    )
    .bind(current.user.id)
    .bind(since)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let _ = sqlx::query("update devices set last_seen_at = now() where id = $1")
        .bind(device_internal)
        .execute(&state.pool)
        .await;

    Ok(Json(json!({
        "protocol_version": PROTOCOL_VERSION,
        "last_seq": last_seq,
        "changes_after": changes_after,
        "server_time": Utc::now(),
    })))
}
