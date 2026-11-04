//! Season episodes and watched progress for TV records.

use axum::Json;
use axum::extract::{Path, Query, State};
use jey_core::items::{ItemKind, MovieDetails, WatchedEpisode};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;
use crate::items::repo;
use crate::items::view::ItemView;
use crate::movies::language_for;

#[derive(Debug, Deserialize)]
pub struct SeasonQuery {
    pub season: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleEpisode {
    pub watched: bool,
}

fn tmdb_id(item: &jey_core::items::Item) -> Result<u64, AppError> {
    if item.kind != ItemKind::Tv {
        return Err(AppError::validation_field(
            "kind",
            "episodes are available only for series",
        ));
    }
    if item.external_source.as_deref() != Some("tmdb") {
        return Err(AppError::validation_field(
            "external_source",
            "episodes require a TMDB-linked series",
        ));
    }

    item.external_id
        .as_deref()
        .ok_or_else(|| AppError::validation_field("external_id", "TMDB id is missing"))?
        .parse::<u64>()
        .map_err(|_| AppError::validation_field("external_id", "TMDB id is not a number"))
}

/// `GET /api/v1/items/{id}/episodes?season=1`
pub async fn season(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
    Query(query): Query<SeasonQuery>,
) -> Result<Json<Value>, AppError> {
    let item_id = parse_id(&raw_id)?;
    let item = repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;
    let external_id = tmdb_id(&item)?;

    if !state.tmdb.configured() {
        return Err(AppError::unavailable("TMDB is not configured"));
    }

    let season_number = query.season.unwrap_or(1);
    if !(0..=100).contains(&season_number) {
        return Err(AppError::validation_field(
            "season",
            "season must be between 0 and 100",
        ));
    }

    let season = state
        .tmdb
        .season(
            external_id,
            season_number,
            language_for(&current.user.locale),
        )
        .await?;

    let watched: std::collections::BTreeSet<(i32, i32)> = item
        .details
        .as_ref()
        .map(|details| {
            details
                .watched_episodes
                .iter()
                .map(|episode| (episode.season_number, episode.episode_number))
                .collect()
        })
        .unwrap_or_default();

    let episodes: Vec<Value> = season
        .episodes
        .iter()
        .map(|episode| {
            json!({
                "episode_number": episode.episode_number,
                "name": episode.name,
                "overview": episode.overview,
                "air_date": episode.air_date,
                "runtime": episode.runtime,
                "still_path": episode.still_path,
                "watched": watched.contains(&(season_number, episode.episode_number)),
            })
        })
        .collect();

    Ok(Json(json!({
        "season": {
            "season_number": season.season_number,
            "name": season.name,
        },
        "episodes": episodes,
    })))
}

/// `POST /api/v1/items/{id}/episodes/{season}` — mark/unmark a whole season.
pub async fn toggle_season(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((raw_id, season_number)): Path<(String, i32)>,
    Json(payload): Json<ToggleEpisode>,
) -> Result<Json<Value>, AppError> {
    if !(0..=100).contains(&season_number) {
        return Err(AppError::validation_field(
            "season",
            "season is out of range",
        ));
    }

    let item_id = parse_id(&raw_id)?;
    let item = repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;
    let external_id = tmdb_id(&item)?;
    if !state.tmdb.configured() {
        return Err(AppError::unavailable("TMDB is not configured"));
    }

    let season = state
        .tmdb
        .season(
            external_id,
            season_number,
            language_for(&current.user.locale),
        )
        .await?;
    let numbers: std::collections::BTreeSet<i32> = season
        .episodes
        .iter()
        .map(|episode| episode.episode_number)
        .collect();

    let mut details = item
        .details
        .clone()
        .ok_or_else(|| AppError::validation_field("details", "series has no metadata"))?;

    details.watched_episodes.retain(|episode| {
        !(episode.season_number == season_number && numbers.contains(&episode.episode_number))
    });
    if payload.watched {
        details
            .watched_episodes
            .extend(numbers.iter().map(|episode_number| WatchedEpisode {
                season_number,
                episode_number: *episode_number,
            }));
        details
            .watched_episodes
            .sort_by_key(|episode| (episode.season_number, episode.episode_number));
    }

    let patch = jey_core::items::validate::validate_patch(&jey_core::items::ItemPatch {
        details: Some(details.clone()),
        ..jey_core::items::ItemPatch::default()
    })?;
    let updated = repo::update(&state.pool, current.user.id, item_id, &patch)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({
        "item": ItemView::from(updated),
        "watched_total": details.watched_episodes.len(),
    })))
}

/// `POST /api/v1/items/{id}/episodes/{season}/{episode}`
pub async fn toggle(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((raw_id, season_number, episode_number)): Path<(String, i32, i32)>,
    Json(payload): Json<ToggleEpisode>,
) -> Result<Json<Value>, AppError> {
    if !(0..=100).contains(&season_number) || !(1..=10_000).contains(&episode_number) {
        return Err(AppError::validation_field(
            "episode",
            "season or episode is out of range",
        ));
    }

    let item_id = parse_id(&raw_id)?;
    let item = repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;
    tmdb_id(&item)?;

    let mut details = item
        .details
        .clone()
        .ok_or_else(|| AppError::validation_field("details", "series has no metadata"))?;

    details.watched_episodes.retain(|episode| {
        !(episode.season_number == season_number && episode.episode_number == episode_number)
    });

    if payload.watched {
        details.watched_episodes.push(WatchedEpisode {
            season_number,
            episode_number,
        });
        details
            .watched_episodes
            .sort_by_key(|episode| (episode.season_number, episode.episode_number));
    }

    let patch = jey_core::items::validate::validate_patch(&jey_core::items::ItemPatch {
        details: Some(details.clone()),
        ..jey_core::items::ItemPatch::default()
    })?;

    let updated = repo::update(&state.pool, current.user.id, item_id, &patch)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    let total = details.watched_episodes.len();

    Ok(Json(json!({
        "item": ItemView::from(updated),
        "watched_total": total,
    })))
}

// Keep the import used on older Rust versions where the type is inferred late.
#[allow(dead_code)]
fn _details_type(_: Option<&MovieDetails>) {}
