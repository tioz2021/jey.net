//! Movie metadata from TMDB.
//!
//! The API key never leaves the server: the browser talks to these endpoints,
//! the server talks to TMDB. Search responses are cached for a day so typing
//! does not burn the rate limit.

pub mod tmdb;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
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
    let results = state.tmdb.search(q, language).await?;

    Ok(Json(json!({ "results": results })).into_response())
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
    let movie = state.tmdb.details(id, language).await?;

    Ok(Json(json!({ "movie": movie })).into_response())
}

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({ "error": { "code": "unavailable", "message": "TMDB is not configured" } })),
    )
        .into_response()
}

/// TMDB speaks `xx-YY`; unknown locales fall back to Russian.
fn language_for(locale: &str) -> &'static str {
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
