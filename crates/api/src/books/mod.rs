//! Book metadata from Open Library.

pub mod google;
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
    pub cover: Option<i64>,
    pub url: Option<String>,
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

    let locale = match current.user.locale.as_str() {
        "ru" => "ru",
        "uk" => "uk",
        _ => "en",
    };
    let key = state.config.google_books_key.as_deref();

    let google_query = async {
        match key {
            Some(key) => google::search(q, key, locale).await,
            None => Ok(Vec::new()),
        }
    };
    let openlibrary_query = openlibrary::search(q);
    let (google_result, openlibrary_result) = tokio::join!(google_query, openlibrary_query);

    let google_results = google_result.unwrap_or_default();
    let openlibrary_results = openlibrary_result.unwrap_or_default();
    if google_results.is_empty() && openlibrary_results.is_empty() && key.is_none() {
        return Err(AppError::unavailable("Google Books is not configured"));
    }

    let results = merge_results(q, google_results, openlibrary_results);
    Ok(Json(json!({ "results": results })).into_response())
}

/// `GET /api/v1/books/{id}`
pub async fn details(
    State(state): State<crate::http::AppState>,
    _current: CurrentUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let book = if id.starts_with("gb:") {
        let key = state
            .config
            .google_books_key
            .as_deref()
            .ok_or_else(|| AppError::unavailable("Google Books is not configured"))?;
        google::details(&id, key).await?
    } else {
        openlibrary::details(&id).await?
    };
    Ok(Json(json!({ "book": book })).into_response())
}

/// `GET /api/v1/books/image?cover=123&size=M`
pub async fn image(
    State(_state): State<crate::http::AppState>,
    Query(query): Query<CoverQuery>,
) -> Result<Response, AppError> {
    let size = query.size.as_deref().unwrap_or("M");
    let (content_type, bytes) = if let Some(url) = query.url.as_deref() {
        google::cover(url).await?
    } else {
        let cover = query
            .cover
            .ok_or_else(|| AppError::validation_field("cover", "cover is required"))?;
        openlibrary::cover(cover, size).await?
    };
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

fn merge_results(
    query: &str,
    mut google: Vec<openlibrary::SearchItem>,
    mut openlibrary: Vec<openlibrary::SearchItem>,
) -> Vec<openlibrary::SearchItem> {
    fn has_cover(item: &openlibrary::SearchItem) -> bool {
        item.cover_url.is_some() || item.cover_id.is_some()
    }
    fn key(item: &openlibrary::SearchItem) -> String {
        format!(
            "{}|{}",
            item.title.trim().to_lowercase(),
            item.authors
                .first()
                .map(|author| author.trim().to_lowercase())
                .unwrap_or_default()
        )
    }

    let needle = query.trim().to_lowercase();
    let relevance = |item: &openlibrary::SearchItem| {
        let title = item.title.trim().to_lowercase();
        if title == needle {
            0
        } else if title.contains(&needle) || needle.contains(&title) {
            1
        } else {
            2
        }
    };
    google.sort_by_key(|item| relevance(item));
    openlibrary.sort_by_key(|item| relevance(item));

    let mut merged: Vec<openlibrary::SearchItem> = Vec::new();
    for item in google.into_iter().chain(openlibrary) {
        let item_key = key(&item);
        if let Some(existing) = merged
            .iter_mut()
            .find(|candidate| key(candidate) == item_key)
        {
            // Keep the richer cover when the same book came from both sources.
            if !has_cover(existing) && has_cover(&item) {
                *existing = item;
            }
        } else {
            merged.push(item);
        }
    }

    // Interleave providers: an Open Library result with a cover should not be
    // buried under eight Google results, while Google's relevance order stays
    // intact within its own half.
    let (google, openlibrary): (Vec<_>, Vec<_>) = merged
        .into_iter()
        .partition(|item| item.source == "googlebooks");
    let mut interleaved = Vec::with_capacity(google.len() + openlibrary.len());
    for index in 0..google.len().max(openlibrary.len()) {
        if let Some(item) = google.get(index) {
            interleaved.push(item.clone());
        }
        if let Some(item) = openlibrary.get(index) {
            interleaved.push(item.clone());
        }
    }
    interleaved.truncate(12);
    interleaved
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
        cover_url: book.cover_url.clone(),
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
