//! Refreshing a TMDB snapshot without touching the person's own edits.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;
use crate::items::repo;
use crate::items::view::ItemView;
use crate::movies::language_for;
use jey_core::items::{ItemPatch, validate::validate_patch};

/// `POST /api/v1/items/{id}/refresh`
pub async fn refresh(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let item_id = parse_id(&raw_id)?;
    let item = repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    if item.external_source.as_deref() != Some("tmdb") {
        return Err(AppError::validation_field(
            "external_source",
            "only records imported from TMDB can be refreshed",
        ));
    }

    let external_id = item
        .external_id
        .as_deref()
        .ok_or_else(|| AppError::validation_field("external_id", "TMDB id is missing"))?
        .parse::<u64>()
        .map_err(|_| AppError::validation_field("external_id", "TMDB id is not a number"))?;

    if !state.tmdb.configured() {
        return Err(AppError::unavailable("TMDB is not configured"));
    }

    let fresh = state
        .tmdb
        .details_fresh(external_id, language_for(&current.user.locale))
        .await?;

    let patch = validate_patch(&ItemPatch {
        details: Some(fresh.snapshot()),
        ..ItemPatch::default()
    })?;

    let updated = repo::update(&state.pool, current.user.id, item_id, &patch)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({ "item": ItemView::from(updated) })))
}
