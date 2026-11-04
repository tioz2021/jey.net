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

    let source = item.external_source.as_deref();
    let fresh =
        match source {
            Some("openlibrary") => {
                let external_id = item.external_id.as_deref().ok_or_else(|| {
                    AppError::validation_field("external_id", "book id is missing")
                })?;
                let book = crate::books::openlibrary::details(external_id).await?;
                crate::books::snapshot(&book)
            }
            Some("googlebooks") => {
                let external_id = item.external_id.as_deref().ok_or_else(|| {
                    AppError::validation_field("external_id", "book id is missing")
                })?;
                let key = state
                    .config
                    .google_books_key
                    .as_deref()
                    .ok_or_else(|| AppError::unavailable("Google Books is not configured"))?;
                let book = crate::books::google::details(external_id, key).await?;
                crate::books::snapshot(&book)
            }
            Some("anilist") => {
                let external_id = item.external_id.as_deref().ok_or_else(|| {
                    AppError::validation_field("external_id", "anime id is missing")
                })?;
                let id: u64 = external_id
                    .parse()
                    .map_err(|_| AppError::validation_field("external_id", "invalid anime id"))?;
                crate::anime::anilist::details(id).await?
            }
            Some("shikimori") => {
                let external_id = item.external_id.as_deref().ok_or_else(|| {
                    AppError::validation_field("external_id", "anime id is missing")
                })?;
                let id: u64 = external_id
                    .parse()
                    .map_err(|_| AppError::validation_field("external_id", "invalid anime id"))?;
                crate::anime::shikimori::details(id).await?
            }
            Some("igdb") => {
                let external_id = item.external_id.as_deref().ok_or_else(|| {
                    AppError::validation_field("external_id", "game id is missing")
                })?;
                let id: u64 = external_id
                    .parse()
                    .map_err(|_| AppError::validation_field("external_id", "invalid game id"))?;
                state.igdb.details(id).await?
            }
            Some("tmdb") => {
                let external_id = item
                    .external_id
                    .as_deref()
                    .ok_or_else(|| AppError::validation_field("external_id", "TMDB id is missing"))?
                    .parse::<u64>()
                    .map_err(|_| {
                        AppError::validation_field("external_id", "TMDB id is not a number")
                    })?;

                if !state.tmdb.configured() {
                    return Err(AppError::unavailable("TMDB is not configured"));
                }

                let language = language_for(&current.user.locale);
                if item.kind == jey_core::items::ItemKind::Tv {
                    state
                        .tmdb
                        .tv_details_all(external_id, language)
                        .await?
                        .snapshot()
                } else {
                    state
                        .tmdb
                        .details_fresh(external_id, language)
                        .await?
                        .snapshot()
                }
            }
            _ => {
                return Err(AppError::validation_field(
                    "external_source",
                    "only records imported from TMDB or Open Library can be refreshed",
                ));
            }
        };

    let mut snapshot = fresh;
    if item.kind == jey_core::items::ItemKind::Tv {
        // Refreshing metadata must never erase the watched progress.
        snapshot.watched_episodes = item
            .details
            .as_ref()
            .map(|details| details.watched_episodes.clone())
            .unwrap_or_default();
    }

    let patch = validate_patch(&ItemPatch {
        details: Some(snapshot),
        ..ItemPatch::default()
    })?;

    let updated = repo::update(&state.pool, current.user.id, item_id, &patch)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({ "item": ItemView::from(updated) })))
}
