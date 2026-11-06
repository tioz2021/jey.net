//! `GET /api/v1/sync/pull` — stream item changes after a sequence.
//!
//! Pull is read-only and deliberately simple: one ordered page by
//! `(user_id, sync_seq)`, tombstones included, no JSON payload for tombstones.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

const PROTOCOL_VERSION: i64 = 1;
const DEFAULT_LIMIT: i64 = 200;
const MAX_LIMIT: i64 = 500;

#[derive(Debug, Deserialize)]
pub struct PullQuery {
    pub since: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, FromRow)]
struct PullRow {
    id: Uuid,
    sync_seq: i64,
    revision: i64,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    payload: sqlx::types::Json<Value>,
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

pub async fn pull(
    State(state): State<AppState>,
    current: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<PullQuery>,
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
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::validation_field(
            "limit",
            format!("limit must be between 1 and {MAX_LIMIT}"),
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

    // Fetch one extra row to answer `has_more` without a second count query.
    let rows = sqlx::query_as::<_, PullRow>(
        "select i.id, i.sync_seq, i.revision, i.updated_at, i.deleted_at,
                jsonb_build_object(
                    'kind', i.kind, 'title', i.title, 'subtitle', i.subtitle,
                    'year', i.year, 'status', i.status, 'rating', i.rating,
                    'review', i.review, 'body', i.body,
                    'source_url', i.source_url, 'cover_key', i.cover_key,
                    'details', i.details, 'public_hidden', i.public_hidden,
                    'external_source', i.external_source, 'external_id', i.external_id
                ) as payload
         from items i
         where i.user_id = $1 and i.sync_seq > $2
         order by i.sync_seq asc
         limit $3",
    )
    .bind(current.user.id)
    .bind(since)
    .bind(limit + 1)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let has_more = rows.len() as i64 > limit;
    let page = &rows[..rows.len().min(limit as usize)];
    let next_since = page.last().map(|row| row.sync_seq).unwrap_or(since);
    let changes: Vec<Value> = page
        .iter()
        .map(|row| {
            let payload = if row.deleted_at.is_some() {
                Value::Null
            } else {
                row.payload.0.clone()
            };
            json!({
                "entity": "item",
                "id": row.id,
                "revision": row.revision,
                "sync_seq": row.sync_seq,
                "updated_at": row.updated_at,
                "deleted_at": row.deleted_at,
                "payload": payload,
            })
        })
        .collect();

    let _ = sqlx::query("update devices set last_seen_at = now() where id = $1")
        .bind(device_internal)
        .execute(&state.pool)
        .await;

    Ok(Json(json!({
        "protocol_version": PROTOCOL_VERSION,
        "changes": changes,
        "next_since": next_since,
        "has_more": has_more,
    })))
}
