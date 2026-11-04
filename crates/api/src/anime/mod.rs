//! Anime metadata: AniList primary, Shikimori for Russian titles.

pub mod anilist;
pub mod shikimori;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::http::ratelimit;
use crate::movies::SEARCH_RULE;

#[derive(Debug, Clone, Serialize)]
pub struct SearchItem {
    pub anime_id: String,
    pub source: String,
    pub title: String,
    pub year: Option<i32>,
    pub cover_url: Option<String>,
    pub format: Option<String>,
    pub episodes: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, Deserialize)]
pub struct CoverQuery {
    pub url: String,
}

pub async fn search(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> Result<Response, AppError> {
    let q = query.q.trim();
    if q.chars().count() < 2 {
        return Ok(Json(json!({ "results": [] })).into_response());
    }
    if q.chars().count() > 100 {
        return Err(AppError::validation_field(
            "q",
            "query must be at most 100 characters",
        ));
    }
    ratelimit::enforce(
        &state.pool,
        SEARCH_RULE,
        &format!("anime:{}", current.user.id),
    )
    .await?;

    let russian = matches!(current.user.locale.as_str(), "ru" | "uk");
    let results = if russian {
        let shikimori = shikimori::search(q).await.unwrap_or_default();
        if shikimori.is_empty() {
            anilist::search(q).await?
        } else {
            shikimori
        }
    } else {
        let anilist = anilist::search(q).await.unwrap_or_default();
        if anilist.is_empty() {
            shikimori::search(q).await?
        } else {
            anilist
        }
    };
    Ok(Json(json!({ "results": results })).into_response())
}

pub async fn details(
    State(_state): State<AppState>,
    _current: CurrentUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let game = if let Some(id) = id.strip_prefix("al:") {
        let id: u64 = id
            .parse()
            .map_err(|_| AppError::validation_field("id", "invalid AniList id"))?;
        anilist::details(id).await?
    } else if let Some(id) = id.strip_prefix("sh:") {
        let id: u64 = id
            .parse()
            .map_err(|_| AppError::validation_field("id", "invalid Shikimori id"))?;
        shikimori::details(id).await?
    } else {
        return Err(AppError::validation_field(
            "id",
            "anime id must start with al: or sh:",
        ));
    };
    Ok(Json(json!({ "anime": game })).into_response())
}

pub async fn image(
    State(_state): State<AppState>,
    Query(query): Query<CoverQuery>,
) -> Result<Response, AppError> {
    if !(query.url.starts_with("https://s4.anilist.co/")
        || query.url.starts_with("https://shikimori.one/")
        || query.url.starts_with("https://shikimori.me/"))
    {
        return Err(AppError::validation_field("url", "invalid anime cover URL"));
    }
    let response = reqwest::Client::new()
        .get(&query.url)
        .header("User-Agent", "jey.net/0.1 (personal catalogue)")
        .send()
        .await
        .map_err(AppError::internal)?;
    if !response.status().is_success() {
        return Err(AppError::not_found("cover not found"));
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_owned();
    let bytes = response.bytes().await.map_err(AppError::internal)?;
    let mut result = (StatusCode::OK, bytes).into_response();
    if let Ok(value) = HeaderValue::from_str(&content_type) {
        result.headers_mut().insert(CONTENT_TYPE, value);
    }
    result.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );
    Ok(result)
}
