//! Movie metadata from TMDB.
//!
//! The API key never leaves the server: the browser talks to these endpoints,
//! the server talks to TMDB. Search responses are cached for a day so typing
//! does not burn the rate limit.

pub mod tmdb;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::http::ratelimit;

/// Search requests per user: enough for typing, not for scraping.
pub const SEARCH_RULE: ratelimit::Rule = ratelimit::Rule {
    limit: 60,
    window: std::time::Duration::from_secs(60),
    block: std::time::Duration::from_secs(60),
};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

/// `GET /api/v1/movies/search?q=астрал`
pub async fn search(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> Result<Response, AppError> {
    if !state.tmdb.configured() {
        return Ok(unavailable());
    }

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
        &format!("movies:{}", current.user.id),
    )
    .await?;

    let language = language_for(&current.user.locale);
    let mut results = state.tmdb.search(q, language).await?;
    if crate::fuzzy::needs_fallback(q, &results, |item| &item.title) {
        let mut candidates = std::mem::take(&mut results);
        for prefix in crate::fuzzy::prefixes_for(q) {
            candidates.extend(state.tmdb.search(&prefix, language).await?);
        }
        results = crate::fuzzy::rank(candidates, q, |item| &item.title);
        results.truncate(8);
    }

    Ok(Json(json!({ "results": results })).into_response())
}

/// `GET /api/v1/tv/search?q=...`
pub async fn tv_search(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> Result<Response, AppError> {
    if !state.tmdb.configured() {
        return Ok(unavailable());
    }

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

    ratelimit::enforce(&state.pool, SEARCH_RULE, &format!("tv:{}", current.user.id)).await?;

    let language = language_for(&current.user.locale);
    let mut results = state.tmdb.search_tv(q, language).await?;
    if crate::fuzzy::needs_fallback(q, &results, |item| &item.title) {
        let mut candidates = std::mem::take(&mut results);
        for prefix in crate::fuzzy::prefixes_for(q) {
            candidates.extend(state.tmdb.search_tv(&prefix, language).await?);
        }
        results = crate::fuzzy::rank(candidates, q, |item| &item.title);
        results.truncate(8);
    }

    Ok(Json(json!({ "results": results })).into_response())
}

/// `GET /api/v1/tv/{id}`
pub async fn tv_details(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Response, AppError> {
    if !state.tmdb.configured() {
        return Ok(unavailable());
    }

    let id: u64 = raw_id
        .parse()
        .map_err(|_| AppError::validation_field("id", "series id must be a number"))?;

    let language = language_for(&current.user.locale);
    let series = state.tmdb.tv_details_all(id, language).await?;

    Ok(Json(json!({ "movie": series })).into_response())
}

/// `GET /api/v1/movies/{id}`
pub async fn details(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Response, AppError> {
    if !state.tmdb.configured() {
        return Ok(unavailable());
    }

    let id: u64 = raw_id
        .parse()
        .map_err(|_| AppError::validation_field("id", "movie id must be a number"))?;

    let language = language_for(&current.user.locale);
    let movie = state.tmdb.details_all(id, language).await?;

    Ok(Json(json!({ "movie": movie })).into_response())
}

#[derive(Debug, Deserialize)]
pub struct ImageQuery {
    pub path: String,
    pub size: Option<String>,
}

/// `GET /api/v1/movies/image?path=/poster.jpg&size=w92`
///
/// Proxies TMDB posters through our domain: the strict CSP allows images only
/// from `self`, and the browser never talks to `image.tmdb.org` directly.
pub async fn image(
    State(_state): State<AppState>,
    Query(query): Query<ImageQuery>,
) -> Result<Response, AppError> {
    let size = match query.size.as_deref().unwrap_or("w92") {
        size @ ("w92" | "w154" | "w185" | "w342" | "w500" | "w780") => size,
        _ => {
            return Err(AppError::validation_field(
                "size",
                "unsupported poster size",
            ));
        }
    };

    if !query.path.starts_with('/')
        || query.path.contains("..")
        || query.path.contains("://")
        || query.path.contains('\\')
    {
        return Err(AppError::validation_field("path", "invalid poster path"));
    }

    let response = reqwest::Client::new()
        .get(format!("https://image.tmdb.org/t/p/{size}{}", query.path))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(AppError::internal)?;

    if !response.status().is_success() {
        return Err(AppError::not_found("poster not found"));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.starts_with("image/"))
        .unwrap_or("image/jpeg")
        .to_owned();
    let bytes = response.bytes().await.map_err(AppError::internal)?;

    let mut result = bytes.into_response();
    result.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&content_type).map_err(AppError::internal)?,
    );
    result.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=86400, immutable"),
    );

    Ok(result)
}

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({ "error": { "code": "unavailable", "message": "TMDB is not configured" } })),
    )
        .into_response()
}

/// TMDB speaks `xx-YY`; unknown locales fall back to Russian.
pub(crate) fn language_for(locale: &str) -> &'static str {
    match locale {
        "en" => "en-US",
        "uk" => "uk-UA",
        _ => "ru-RU",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locales_map_to_tmdb_languages() {
        assert_eq!(language_for("ru"), "ru-RU");
        assert_eq!(language_for("en"), "en-US");
        assert_eq!(language_for("uk"), "uk-UA");
        assert_eq!(language_for("de"), "ru-RU");
    }
}
