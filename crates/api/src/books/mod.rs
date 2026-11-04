//! Book metadata from Open Library.

pub mod openlibrary;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header::CACHE_CONTROL;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::ratelimit;
use crate::movies::SEARCH_RULE;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, Deserialize)]
pub struct CoverQuery {
    pub cover: i64,
    pub size: Option<String>,
}

/// `GET /api/v1/books/search?q=...`
pub async fn search(
    State(state): State<crate::http::AppState>,
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
        &format!("books:{}", current.user.id),
    )
    .await?;

    let results = openlibrary::search(q).await?;
    Ok(Json(json!({ "results": results })).into_response())
}

/// `GET /api/v1/books/{id}`
pub async fn details(
    State(_state): State<crate::http::AppState>,
    _current: CurrentUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let book = openlibrary::details(&id).await?;
    Ok(Json(json!({ "book": book })).into_response())
}

/// `GET /api/v1/books/image?cover=123&size=M`
pub async fn image(
    State(_state): State<crate::http::AppState>,
    Query(query): Query<CoverQuery>,
) -> Result<Response, AppError> {
    let size = query.size.as_deref().unwrap_or("M");
    let (content_type, bytes) = openlibrary::cover(query.cover, size).await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    response.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("image/jpeg")),
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=86400"),
    );
    Ok(response)
}

/// Build a record snapshot from a book.
pub fn snapshot(book: &openlibrary::BookDetails) -> jey_core::items::MovieDetails {
    jey_core::items::MovieDetails {
        original_title: book.title.clone(),
        overview: book.overview.clone(),
        tagline: None,
        runtime: None,
        release_date: book.year.map(|year| format!("{year}-01-01")),
        status: None,
        director: (!book.authors.is_empty()).then(|| book.authors.join(", ")),
        authors: book.authors.clone(),
        publisher: book.publisher.clone(),
        page_count: book.page_count,
        isbn: book.isbn.clone(),
        cover_id: book.cover_id,
        cast: Vec::new(),
        genres: book.subjects.clone(),
        countries: Vec::new(),
        languages: Vec::new(),
        companies: Vec::new(),
        budget: None,
        revenue: None,
        imdb_id: None,
        vote_average_tenths: None,
        vote_count: None,
        translations: Default::default(),
        number_of_seasons: None,
        number_of_episodes: None,
        seasons: Vec::new(),
        watched_episodes: Vec::new(),
    }
}
