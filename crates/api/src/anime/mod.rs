//! Anime metadata: AniList primary, Shikimori for Russian titles.

pub mod anilist;
pub mod shikimori;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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
use jey_core::items::MovieDetails;

const SEARCH_TTL: Duration = Duration::from_secs(15 * 60);
const DETAILS_TTL: Duration = Duration::from_secs(60 * 60);
const CACHE_CAPACITY: usize = 200;

/// Cached and concurrency-limited anime metadata client.
pub struct AnimeClient {
    search_cache: Mutex<HashMap<String, (Instant, Vec<SearchItem>)>>,
    details_cache: Mutex<HashMap<String, (Instant, MovieDetails)>>,
    permits: Arc<tokio::sync::Semaphore>,
}

impl Default for AnimeClient {
    fn default() -> Self {
        Self::new()
    }
}

impl AnimeClient {
    pub fn new() -> Self {
        Self {
            search_cache: Mutex::new(HashMap::new()),
            details_cache: Mutex::new(HashMap::new()),
            permits: Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }

    pub async fn search(&self, query: &str, locale: &str) -> Result<Vec<SearchItem>, AppError> {
        let key = format!("{locale}:{query}");
        if let Some(value) = self.cached_search(&key) {
            return Ok(value);
        }

        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::internal("anime request limiter is closed"))?;
        if let Some(value) = self.cached_search(&key) {
            return Ok(value);
        }

        let russian = matches!(locale, "ru" | "uk");
        let results = if russian {
            let shikimori = shikimori::search(query).await.unwrap_or_default();
            if shikimori.is_empty() {
                anilist::search(query).await?
            } else {
                shikimori
            }
        } else {
            let anilist = anilist::search(query).await.unwrap_or_default();
            if anilist.is_empty() {
                shikimori::search(query).await?
            } else {
                anilist
            }
        };

        self.store_search(key, results.clone());
        Ok(results)
    }

    pub async fn details(&self, id: &str) -> Result<MovieDetails, AppError> {
        if let Some(value) = self.cached_details(id) {
            return Ok(value);
        }

        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::internal("anime request limiter is closed"))?;
        if let Some(value) = self.cached_details(id) {
            return Ok(value);
        }

        let value = if let Some(id) = id.strip_prefix("al:") {
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

        if let Ok(mut cache) = self.details_cache.lock() {
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
            cache.insert(id.to_owned(), (Instant::now(), value.clone()));
        }
        Ok(value)
    }

    fn cached_search(&self, key: &str) -> Option<Vec<SearchItem>> {
        let cache = self.search_cache.lock().ok()?;
        let (at, value) = cache.get(key)?;
        (at.elapsed() < SEARCH_TTL).then(|| value.clone())
    }

    fn store_search(&self, key: String, value: Vec<SearchItem>) {
        if let Ok(mut cache) = self.search_cache.lock() {
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
            cache.insert(key, (Instant::now(), value));
        }
    }

    fn cached_details(&self, id: &str) -> Option<MovieDetails> {
        let cache = self.details_cache.lock().ok()?;
        let (at, value) = cache.get(id)?;
        (at.elapsed() < DETAILS_TTL).then(|| value.clone())
    }
}

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

    let mut results = state.anime.search(q, &current.user.locale).await?;
    if crate::fuzzy::needs_fallback(q, &results, |item| &item.title) {
        crate::analytics::record(&state.pool, "provider_fallback", None, None).await;
        let mut candidates = std::mem::take(&mut results);
        for prefix in crate::fuzzy::prefixes_for(q) {
            candidates.extend(state.anime.search(&prefix, &current.user.locale).await?);
        }
        results = crate::fuzzy::rank(candidates, q, |item| &item.title);
        results.truncate(8);
    }
    if results.is_empty() {
        crate::analytics::record(&state.pool, "search_failed", None, None).await;
    }
    Ok(Json(json!({ "results": results })).into_response())
}

pub async fn details(
    State(state): State<AppState>,
    _current: CurrentUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let game = state.anime.details(&id).await?;
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

/// Shikimori descriptions contain BBCode-like references such as
/// `[character=42]Name[/character]`; keep the visible name, drop the markup.
pub(crate) fn clean_description(value: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '[' {
            if let Some(offset) = chars[index + 1..].iter().position(|ch| *ch == ']') {
                let end = index + 1 + offset;
                let tag: String = chars[index + 1..end].iter().collect();
                if is_markup_tag(&tag) {
                    index = end + 1;
                    continue;
                }
            }
        }
        result.push(chars[index]);
        index += 1;
    }
    result.trim().to_owned()
}

fn is_markup_tag(tag: &str) -> bool {
    let tag = tag.trim().to_lowercase();
    if tag.starts_with('/') {
        return true;
    }
    matches!(
        tag.split('=').next().unwrap_or_default(),
        "character"
            | "anime"
            | "manga"
            | "person"
            | "url"
            | "spoiler"
            | "b"
            | "i"
            | "u"
            | "s"
            | "quote"
            | "code"
            | "center"
            | "color"
            | "size"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_character_markup() {
        assert_eq!(
            clean_description("В компании [character=1]Нанати[/character] и [b]друзей[/b]."),
            "В компании Нанати и друзей."
        );
    }
}
