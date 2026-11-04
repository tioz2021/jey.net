//! Game metadata from IGDB.

pub mod igdb;

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
use crate::movies::SEARCH_RULE;

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
    if !state.igdb.configured() {
        return Err(AppError::unavailable("IGDB is not configured"));
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
        &format!("games:{}", current.user.id),
    )
    .await?;
    Ok(Json(json!({ "results": state.igdb.search(q).await? })).into_response())
}

pub async fn details(
    State(state): State<AppState>,
    _current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Response, AppError> {
    let id: u64 = raw_id
        .parse()
        .map_err(|_| AppError::validation_field("id", "game id must be a number"))?;
    let game = state.igdb.details(id).await?;
    Ok(Json(json!({ "game": game })).into_response())
}

pub async fn image(
    State(state): State<AppState>,
    Query(query): Query<CoverQuery>,
) -> Result<Response, AppError> {
    let (content_type, bytes) = state.igdb.cover(&query.url).await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    if let Ok(value) = HeaderValue::from_str(&content_type) {
        response.headers_mut().insert(CONTENT_TYPE, value);
    }
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );
    Ok(response)
}
