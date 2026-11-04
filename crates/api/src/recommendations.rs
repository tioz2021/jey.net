//! Recommendations from public ratings of followed profiles.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::books::openlibrary::SearchItem as BookSearchItem;
use crate::error::AppError;
use crate::http::AppState;
use crate::movies::tmdb::SimilarItem;

const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const CACHE_CAPACITY: usize = 200;

/// Short-lived cache for the aggregate recommendation endpoints.
pub struct RecommendationCache {
    values: Mutex<HashMap<String, (Instant, Value)>>,
}

impl Default for RecommendationCache {
    fn default() -> Self {
        Self::new()
    }
}

impl RecommendationCache {
    pub fn new() -> Self {
        Self {
            values: Mutex::new(HashMap::new()),
        }
    }

    fn get(&self, key: &str) -> Option<Value> {
        let cache = self.values.lock().ok()?;
        let (at, value) = cache.get(key)?;
        (at.elapsed() < CACHE_TTL).then(|| value.clone())
    }

    fn set(&self, key: String, value: Value) {
        if let Ok(mut cache) = self.values.lock() {
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
            cache.insert(key, (Instant::now(), value));
        }
    }
}

type SimilarRow = (
    String,
    Option<String>,
    Option<String>,
    String,
    Option<serde_json::Value>,
);

async fn search_books(
    state: &AppState,
    source: &str,
    query: &str,
    language: &str,
) -> Vec<BookSearchItem> {
    if source == "googlebooks" {
        match state.config.google_books_key.as_deref() {
            Some(key) => crate::books::google::search(query, key, language)
                .await
                .unwrap_or_default(),
            None => Vec::new(),
        }
    } else {
        crate::books::openlibrary::search(query)
            .await
            .unwrap_or_default()
    }
}

fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric() || character.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn languages(locale: &str) -> (&'static str, &'static str) {
    match locale {
        "ru" => ("ru-RU", "ru"),
        "uk" => ("uk-UA", "uk"),
        _ => ("en-US", "en"),
    }
}

async fn load_similar(
    state: &AppState,
    id: uuid::Uuid,
    owner: Option<uuid::Uuid>,
    tmdb_language: &str,
    book_language: &str,
) -> Result<Value, AppError> {
    let row: Option<SimilarRow> = match owner {
        Some(user_id) => sqlx::query_as(
            "select kind, external_source, external_id, title, details from items
                 where id = $1 and user_id = $2 and deleted_at is null",
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?,
        None => sqlx::query_as(
            "select i.kind, i.external_source, i.external_id, i.title, i.details
                 from items i
                 join users u on u.id = i.user_id
                 where i.id = $1 and i.deleted_at is null
                   and not i.public_hidden
                   and u.is_public and u.deleted_at is null
                   and i.status = ANY(u.public_statuses)",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?,
    };
    let (kind, source, external_id, title, details) =
        row.ok_or_else(|| AppError::not_found("record"))?;
    let Some(source) = source else {
        return Ok(json!({ "items": [] }));
    };
    let Some(external_id) = external_id else {
        return Ok(json!({ "items": [] }));
    };

    if source == "openlibrary" || source == "googlebooks" {
        let details = details.unwrap_or_default();
        let authors: Vec<String> = details
            .get("authors")
            .and_then(serde_json::Value::as_array)
            .map(|authors| {
                authors
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|author| !author.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        let subjects: Vec<String> = details
            .get("genres")
            .and_then(serde_json::Value::as_array)
            .map(|genres| {
                genres
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|subject| !subject.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        if authors.is_empty() && subjects.is_empty() {
            return Ok(json!({ "items": [] }));
        }

        let mut candidates: Vec<BookSearchItem> = Vec::new();
        if let Some(author) = authors.first() {
            // Cannot await inside the closure; fill synchronously through a helper query.
            if source == "googlebooks" {
                let query = format!("inauthor:\"{}\"", author.replace('"', "\\\""));
                candidates.extend(search_books(state, "googlebooks", &query, book_language).await);
            } else {
                let query = format!("author:\"{}\"", author.replace('"', "\\\""));
                candidates.extend(search_books(state, "openlibrary", &query, book_language).await);
                if let Some(key) = state.config.google_books_key.as_deref() {
                    let query = format!("inauthor:\"{}\"", author.replace('"', "\\\""));
                    candidates.extend(
                        crate::books::google::search(&query, key, book_language)
                            .await
                            .unwrap_or_default(),
                    );
                }
            }
        }
        // If the author is not enough, add subject matches; keep the author matches first.
        if candidates.len() < 8
            && let Some(subject) = subjects.first()
        {
            if source == "googlebooks" {
                let query = format!("subject:\"{}\"", subject.replace('"', "\\\""));
                candidates.extend(search_books(state, "googlebooks", &query, book_language).await);
            } else {
                let query = format!("subject:\"{}\"", subject.replace('"', "\\\""));
                candidates.extend(search_books(state, "openlibrary", &query, book_language).await);
                if let Some(key) = state.config.google_books_key.as_deref() {
                    candidates.extend(
                        crate::books::google::search(&query, key, book_language)
                            .await
                            .unwrap_or_default(),
                    );
                }
            }
        }

        let wanted_authors: Vec<String> =
            authors.iter().map(|author| author.to_lowercase()).collect();
        let wanted_title = normalize_title(&title);
        let mut seen = HashSet::new();
        let mut scored: Vec<(u8, BookSearchItem)> = Vec::new();
        for book in candidates {
            if book.book_id == external_id || normalize_title(&book.title) == wanted_title {
                continue;
            }
            let key = format!(
                "{}|{}",
                normalize_title(&book.title),
                book.authors
                    .first()
                    .map_or("", String::as_str)
                    .to_lowercase()
            );
            if !seen.insert(key) {
                continue;
            }
            let by_author = book
                .authors
                .iter()
                .any(|author| wanted_authors.contains(&author.to_lowercase()));
            let rank = if by_author {
                0
            } else if book.cover_id.is_some() || book.cover_url.is_some() {
                1
            } else {
                2
            };
            scored.push((rank, book));
        }
        scored.sort_by_key(|(rank, book)| (*rank, std::cmp::Reverse(book.year.unwrap_or(0))));
        let items: Vec<SimilarItem> = scored
            .into_iter()
            .take(12)
            .map(|(_, book)| SimilarItem {
                source: book.source.clone(),
                external_id: book.book_id.clone(),
                title: book.title,
                year: book.year,
                poster_path: None,
                cover_url: book.cover_url,
                cover_id: book.cover_id,
                kind: "book".to_owned(),
                href: if book.source == "googlebooks" {
                    format!(
                        "https://books.google.com/books?id={}",
                        book.book_id.trim_start_matches("gb:")
                    )
                } else {
                    format!("https://openlibrary.org/works/{}", book.book_id)
                },
            })
            .collect();
        return Ok(json!({ "items": items }));
    }

    let Some(external_id) = external_id.parse::<u64>().ok() else {
        return Ok(json!({ "items": [] }));
    };
    let items = match source.as_str() {
        "tmdb" => {
            let media = if kind == "tv" { "tv" } else { "movie" };
            state
                .tmdb
                .similar(media, external_id, tmdb_language)
                .await?
        }
        "igdb" => state.igdb.similar(external_id).await?,
        "anilist" => crate::anime::anilist::similar(external_id).await?,
        "shikimori" => crate::anime::shikimori::similar(external_id).await?,
        _ => Vec::new(),
    };
    Ok(json!({ "items": items }))
}

/// `GET /api/v1/items/{id}/similar` — provider suggestions for one record.
pub async fn similar(
    State(state): State<AppState>,
    current: CurrentUser,
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
) -> Result<Json<Value>, AppError> {
    let cache_key = format!("similar:{}", id);
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let (tmdb_language, book_language) = languages(&current.user.locale);
    let payload = load_similar(
        &state,
        id,
        Some(current.user.id),
        tmdb_language,
        book_language,
    )
    .await?;
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}

/// `GET /api/v1/public/items/{id}/similar` — the same block for guests.
pub async fn public_similar(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
) -> Result<Json<Value>, AppError> {
    let cache_key = format!("public-similar:{}", id);
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let payload = load_similar(&state, id, None, "ru-RU", "ru").await?;
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}

/// `GET /api/v1/recommendations/friends`
pub async fn friends(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let cache_key = format!("friends:{}", current.user.id);
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let items: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', i.id,
            'author_id', (array_agg(u.id order by f.created_at desc))[1],
            'kind', i.kind,
            'title', i.title,
            'subtitle', i.subtitle,
            'year', i.year,
            'status', i.status,
            'rating', i.rating,
            'review', i.review,
            'cover_key', i.cover_key,
            'external_source', i.external_source,
            'external_id', i.external_id,
            'details', i.details,
            'updated_at', i.updated_at,
            'friends', jsonb_agg(distinct u.display_name),
            'friend_count', count(distinct u.id),
            'average_rating', round(avg(i.rating)::numeric, 1)
         )
         from follows f
         join users u on u.id = f.followee_id
         join items i on i.user_id = u.id
         where f.follower_id = $1
           and u.is_public and u.deleted_at is null
           and i.status = 'done'
           and i.rating >= 8
           and not i.public_hidden
           and i.deleted_at is null
           and 'done' = ANY(u.public_statuses)
           and not exists (
               select 1 from items mine
               where mine.user_id = $1
                 and mine.deleted_at is null
                 and (
                     (i.external_source is not null
                      and mine.external_source = i.external_source
                      and mine.external_id = i.external_id)
                     or lower(mine.title) = lower(i.title)
                 )
           )
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         group by i.id
         order by avg(i.rating) desc, count(distinct u.id) desc, i.updated_at desc
         limit 12",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let payload = json!({ "items": items });
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}

/// `GET /api/v1/recommendations/taste` — genres from high ratings and public matches.
pub async fn taste(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let cache_key = format!("taste:{}", current.user.id);
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let genres: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object('name', genre, 'count', count(*))
         from items i
         cross join lateral jsonb_array_elements_text(
             coalesce(i.details->'genres', '[]'::jsonb)
         ) as genre
         where i.user_id = $1
           and i.status = 'done'
           and i.rating >= 8
           and i.deleted_at is null
           and i.details is not null
         group by genre
         order by count(*) desc, genre
         limit 8",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let items: Vec<Value> = sqlx::query_scalar(
        "with top_genres as (
             select genre
             from items i
             cross join lateral jsonb_array_elements_text(
                 coalesce(i.details->'genres', '[]'::jsonb)
             ) as genre
             where i.user_id = $1
               and i.status = 'done'
               and i.rating >= 8
               and i.deleted_at is null
               and i.details is not null
             group by genre
             order by count(*) desc, genre
             limit 5
         )
         select jsonb_build_object(
             'id', i.id,
             'author_id', u.id,
             'author_name', u.display_name,
             'kind', i.kind,
             'title', i.title,
             'subtitle', i.subtitle,
             'year', i.year,
             'status', i.status,
             'rating', i.rating,
             'review', i.review,
             'cover_key', i.cover_key,
             'external_source', i.external_source,
             'external_id', i.external_id,
             'details', i.details,
             'updated_at', i.updated_at,
             'matched_genres', jsonb_agg(distinct genre)
         )
         from items i
         join users u on u.id = i.user_id
         cross join lateral jsonb_array_elements_text(
             coalesce(i.details->'genres', '[]'::jsonb)
         ) as genre
         where i.user_id <> $1
           and u.is_public and u.deleted_at is null
           and i.status = 'done' and i.rating >= 7
           and not i.public_hidden and i.deleted_at is null
           and 'done' = ANY(u.public_statuses)
           and genre in (select genre from top_genres)
           and not exists (
               select 1 from items mine
               where mine.user_id = $1
                 and mine.deleted_at is null
                 and (
                     (i.external_source is not null
                      and mine.external_source = i.external_source
                      and mine.external_id = i.external_id)
                     or lower(mine.title) = lower(i.title)
                 )
           )
           and not exists (
               select 1 from blocks b
               where (b.blocker_id = $1 and b.blocked_id = u.id)
                  or (b.blocker_id = u.id and b.blocked_id = $1)
           )
         group by i.id, u.id, u.display_name
         order by i.rating desc, i.updated_at desc
         limit 12",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let payload = json!({ "genres": genres, "items": items });
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}
