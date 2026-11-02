//! Moving records to the bin and bringing them back.
//!
//! A deleted record is invisible to reads and lists unless the list asks for
//! `include_deleted=true`; a second delete is a plain `404`, because for the
//! API the record no longer exists.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;
use crate::items::repo;
use crate::items::view::ItemView;

/// `DELETE /api/v1/items/{id}`
pub async fn delete_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = parse_id(&raw_id)?;

    let deleted = repo::soft_delete(&state.pool, current.user.id, id).await?;
    if !deleted {
        return Err(AppError::not_found("item not found"));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/items/{id}/purge`
///
/// Removes one record from the bin for good.
pub async fn purge_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = parse_id(&raw_id)?;

    let purged = repo::purge(&state.pool, current.user.id, id).await?;
    if !purged {
        return Err(AppError::not_found("item is not in the bin"));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/trash`
///
/// Empties the whole bin.
pub async fn empty_trash(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let purged = repo::purge_all(&state.pool, current.user.id).await?;

    Ok(Json(json!({ "purged": purged })))
}

/// `POST /api/v1/items/{id}/restore`
pub async fn restore_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let id = parse_id(&raw_id)?;

    let restored = repo::restore(&state.pool, current.user.id, id).await?;
    if !restored {
        return Err(AppError::not_found("item is not in the bin"));
    }

    let item = repo::get(&state.pool, current.user.id, id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({ "item": ItemView::from(item) })))
}
