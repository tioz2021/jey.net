//! `PATCH /api/v1/items/{id}`: change part of a record.

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use jey_core::items::{ItemPatch, validate};
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;
use crate::items::repo;
use crate::items::view::ItemView;

pub async fn update_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
    payload: Result<Json<ItemPatch>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let id = parse_id(&raw_id)?;
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    if payload.is_empty() {
        return Err(AppError::validation("at least one field must be provided"));
    }

    // The current kind decides which statuses make sense, so read it first.
    let existing = repo::get(&state.pool, current.user.id, id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    let patch = validate::validate_patch(&payload)?;

    let effective_kind = patch.kind.unwrap_or(existing.kind);
    let effective_status = patch.status.unwrap_or(existing.status);

    if !validate::status_allowed(effective_kind, effective_status) {
        return Err(AppError::validation_field(
            "status",
            format!("status {effective_status:?} is not allowed for a {effective_kind:?}"),
        ));
    }

    let updated = repo::update(&state.pool, current.user.id, id, &patch)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({ "item": ItemView::from(updated) })))
}
