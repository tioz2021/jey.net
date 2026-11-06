//! Conflict copies produced by `POST /sync/push`.
//!
//! A losing incoming version is stored verbatim. The user resolves it by
//! choosing `incoming` or `stored`; the chosen version becomes the new item
//! revision and gets a fresh `sync_seq` so every device sees the decision.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;
use crate::sync_push::{Change, apply_payload};

#[derive(Debug, FromRow)]
struct ConflictRow {
    id: Uuid,
    item_id: Uuid,
    incoming: Value,
    stored: Value,
    created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveRequest {
    pub keep: String,
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

async fn device_internal(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    external: Uuid,
) -> Result<Uuid, AppError> {
    sqlx::query_scalar("select id from devices where user_id = $1 and installation_id = $2")
        .bind(user_id)
        .bind(external)
        .fetch_optional(pool)
        .await
        .map_err(AppError::internal)?
        .ok_or_else(|| AppError::validation_field("X-Device-Id", "unknown_device"))
}

pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    check_version(&headers)?;
    let external = device_header(&headers)?;
    device_internal(&state.pool, current.user.id, external).await?;

    let rows: Vec<ConflictRow> = sqlx::query_as(
        "select id, item_id, incoming, stored, created_at
         from sync_conflicts
         where user_id = $1 and resolved_at is null
         order by created_at asc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let conflicts: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "conflict_id": row.id,
                "item_id": row.item_id,
                "incoming": row.incoming,
                "stored": row.stored,
                "created_at": row.created_at,
            })
        })
        .collect();

    Ok(Json(json!({ "conflicts": conflicts })))
}

pub async fn resolve(
    State(state): State<AppState>,
    current: CurrentUser,
    headers: HeaderMap,
    Path(conflict_id): Path<Uuid>,
    Json(request): Json<ResolveRequest>,
) -> Result<(StatusCode, Json<ItemView>), AppError> {
    check_version(&headers)?;
    let external = device_header(&headers)?;
    let device = device_internal(&state.pool, current.user.id, external).await?;
    if request.keep != "incoming" && request.keep != "stored" {
        return Err(AppError::validation_field(
            "keep",
            "keep must be incoming or stored",
        ));
    }

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    let conflict: Option<ConflictRow> = sqlx::query_as(
        "select id, item_id, incoming, stored, created_at
         from sync_conflicts
         where id = $1 and user_id = $2 and resolved_at is null
         for update",
    )
    .bind(conflict_id)
    .bind(current.user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(AppError::internal)?;
    let Some(conflict) = conflict else {
        return Err(AppError::not_found("conflict"));
    };

    let existing: Option<(i64, Option<Uuid>)> =
        sqlx::query_as("select revision, device_id from items where id = $1 and user_id = $2")
            .bind(conflict.item_id)
            .bind(current.user.id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(AppError::internal)?;
    let Some((current_revision, _)) = existing else {
        return Err(AppError::not_found("item"));
    };

    if request.keep == "incoming" {
        let incoming: Change = serde_json::from_value(conflict.incoming)
            .map_err(|error| AppError::validation(format!("invalid conflict copy: {error}")))?;
        let next_revision = current_revision.max(incoming.revision) + 1;
        let change = Change {
            revision: next_revision,
            updated_at: Utc::now(),
            ..incoming
        };
        apply_payload(&mut tx, current.user.id, &change, device, true).await?;
    } else {
        // Keeping the stored copy is still a new decision: bump the revision
        // so the other device receives the resolution, not the old state.
        sqlx::query(
            "update items set revision = revision + 1, updated_at = now(), device_id = $3
             where id = $1 and user_id = $2",
        )
        .bind(conflict.item_id)
        .bind(current.user.id)
        .bind(device)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    }

    sqlx::query("update sync_conflicts set resolved_at = now() where id = $1")
        .bind(conflict_id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    tx.commit().await.map_err(AppError::internal)?;

    let item = repo::get_any(&state.pool, current.user.id, conflict.item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item"))?;
    Ok((StatusCode::OK, Json(ItemView::from(item))))
}
