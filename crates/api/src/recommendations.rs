//! Recommendations from public ratings of followed profiles.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::books::openlibrary::SearchItem as BookSearchItem;
use crate::error::AppError;
use crate::http::AppState;
use crate::movies::tmdb::SimilarItem;
use serde::Deserialize;

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

    /// Drop aggregate caches after a user disappears or changes visibility.
    pub fn clear(&self) {
        if let Ok(mut cache) = self.values.lock() {
            cache.clear();
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

#[derive(Debug, serde::Deserialize)]
pub struct PublicSimilarQuery {
    pub locale: Option<String>,
}

/// `GET /api/v1/public/items/{id}/similar` — the same block for guests.
pub async fn public_similar(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
    axum::extract::Query(query): axum::extract::Query<PublicSimilarQuery>,
) -> Result<Json<Value>, AppError> {
    let locale = query.locale.as_deref().unwrap_or("ru");
    let (tmdb_language, book_language) = languages(locale);
    let cache_key = format!("public-similar:{locale}:{id}");
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let payload = load_similar(&state, id, None, tmdb_language, book_language).await?;
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}

#[derive(Debug, Deserialize)]
pub struct HideRecommendation {
    pub author_id: uuid::Uuid,
    pub item_id: uuid::Uuid,
}

/// `POST /api/v1/recommendations/hidden`
pub async fn hide(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(input): Json<HideRecommendation>,
) -> Result<axum::http::StatusCode, AppError> {
    let valid: bool = sqlx::query_scalar(
        "select exists(
            select 1 from items i join users u on u.id = i.user_id
            where i.id = $1 and i.user_id = $2 and i.deleted_at is null
              and u.is_public and u.deleted_at is null
         )",
    )
    .bind(input.item_id)
    .bind(input.author_id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if !valid {
        return Err(AppError::not_found("recommendation"));
    }
    sqlx::query(
        "insert into hidden_recommendations (user_id, author_id, item_id)
         values ($1, $2, $3) on conflict do nothing",
    )
    .bind(current.user.id)
    .bind(input.author_id)
    .bind(input.item_id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    state.recommendations.clear();
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, serde::Deserialize)]
pub struct RecommendationQuery {
    pub kind: Option<String>,
    pub sort: Option<String>,
    pub period: Option<String>,
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

fn recommendation_page(offset: Option<i64>, limit: Option<i64>) -> Result<(i64, i64), AppError> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(12);
    if offset < 0 || !(1..=50).contains(&limit) {
        return Err(AppError::validation_field(
            "pagination",
            "offset must be >= 0 and limit between 1 and 50",
        ));
    }
    Ok((offset, limit))
}

fn recommendation_period(
    raw: Option<&str>,
) -> Result<(&'static str, Option<DateTime<Utc>>), AppError> {
    match raw {
        None | Some("") | Some("all") => Ok(("all", None)),
        Some("24h") => Ok(("24h", Some(Utc::now() - ChronoDuration::hours(24)))),
        Some("week") => Ok(("week", Some(Utc::now() - ChronoDuration::days(7)))),
        Some("month") => Ok(("month", Some(Utc::now() - ChronoDuration::days(30)))),
        _ => Err(AppError::validation_field(
            "period",
            "period must be 24h, week, month or all",
        )),
    }
}

const RECOMMENDATION_KINDS: [&str; 7] = ["movie", "tv", "anime", "book", "game", "image", "other"];

fn recommendation_sort(raw: Option<&str>) -> Result<&'static str, AppError> {
    match raw {
        None | Some("") | Some("rating") => Ok("rating"),
        Some("new") => Ok("new"),
        Some("popular") => Ok("popular"),
        _ => Err(AppError::validation_field(
            "sort",
            "sort must be new, popular or rating",
        )),
    }
}

fn recommendation_kind(raw: Option<&str>) -> Result<Option<&str>, AppError> {
    match raw {
        None | Some("") => Ok(None),
        Some(value) if RECOMMENDATION_KINDS.contains(&value) => Ok(Some(value)),
        _ => Err(AppError::validation_field("kind", "unknown catalogue kind")),
    }
}

fn counts_payload(rows: Vec<(String, i64)>) -> Value {
    let mut counts = serde_json::Map::new();
    let mut total = 0;
    for (kind, count) in rows {
        total += count;
        counts.insert(kind, json!(count));
    }
    counts.insert("all".to_owned(), json!(total));
    Value::Object(counts)
}

/// `GET /api/v1/recommendations/friends`
pub async fn friends(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<RecommendationQuery>,
) -> Result<Json<Value>, AppError> {
    let kind = recommendation_kind(query.kind.as_deref())?;
    let sort = recommendation_sort(query.sort.as_deref())?;
    let (period, since) = recommendation_period(query.period.as_deref())?;
    let (offset, limit) = recommendation_page(query.offset, query.limit)?;
    let cache_key = format!(
        "friends:{}:{}:{}:{}:{}:{}",
        current.user.id,
        kind.unwrap_or("all"),
        sort,
        period,
        offset,
        limit
    );
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let order = match sort {
        "new" => "i.updated_at desc",
        "popular" => "count(distinct u.id) desc, avg(i.rating) desc, i.updated_at desc",
        _ => "avg(i.rating) desc, count(distinct u.id) desc, i.updated_at desc",
    };
    let sql = format!(
        "select jsonb_build_object(
            'id', i.id,
            'slug', i.slug,
            'author_id', (array_agg(u.id order by f.created_at desc))[1],
            'author_handle', (array_agg(u.handle order by f.created_at desc))[1],
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
            'friend_people', jsonb_agg(distinct jsonb_build_object('name', u.display_name, 'handle', u.handle)),
            'friend_count', count(distinct u.id),
            'average_rating', round(avg(i.rating)::numeric, 1)
         )
         from follows f
         join users u on u.id = f.followee_id
         join items i on i.user_id = u.id
         where f.follower_id = $1
           and ($2::text is null or i.kind = $2)
           and ($3::timestamptz is null or i.updated_at >= $3)
           and u.is_public and u.deleted_at is null
           and not exists (
                  select 1 from hidden_recommendations hr
                  join items hidden_item on hidden_item.id = hr.item_id
                  where hr.user_id = $1
                    and (
                        (i.external_source is not null
                         and hidden_item.external_source = i.external_source
                         and hidden_item.external_id = i.external_id)
                        or lower(hidden_item.title) = lower(i.title)
                    )
              )
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
         order by {order}
         limit $5 offset $4"
    );
    let items: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(current.user.id)
        .bind(kind)
        .bind(since)
        .bind(offset)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?;

    let count_rows: Vec<(String, i64)> = sqlx::query_as(
        "with filtered as (
            select i.id, i.kind
            from follows f
            join users u on u.id = f.followee_id
            join items i on i.user_id = u.id
            where f.follower_id = $1
              and ($2::timestamptz is null or i.updated_at >= $2)
              and u.is_public and u.deleted_at is null
              and not exists (
                  select 1 from hidden_recommendations hr
                  join items hidden_item on hidden_item.id = hr.item_id
                  where hr.user_id = $1
                    and (
                        (i.external_source is not null
                         and hidden_item.external_source = i.external_source
                         and hidden_item.external_id = i.external_id)
                        or lower(hidden_item.title) = lower(i.title)
                    )
              )
              and i.status = 'done' and i.rating >= 8
              and not i.public_hidden and i.deleted_at is null
              and 'done' = ANY(u.public_statuses)
              and not exists (
                  select 1 from items mine
                  where mine.user_id = $1 and mine.deleted_at is null
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
            group by i.id, i.kind
         )
         select kind, count(*) from filtered group by kind",
    )
    .bind(current.user.id)
    .bind(since)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let next_offset = (items.len() as i64 == limit).then_some(offset + limit);
    let payload = json!({
        "items": items,
        "counts": counts_payload(count_rows),
        "next_offset": next_offset,
    });
    state.recommendations.set(cache_key, payload.clone());
    Ok(Json(payload))
}

/// `GET /api/v1/recommendations/community` — highly rated public records
/// across every public profile, grouped by the record itself.
pub async fn community(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<RecommendationQuery>,
) -> Result<Json<Value>, AppError> {
    let kind = recommendation_kind(query.kind.as_deref())?;
    let sort = recommendation_sort(query.sort.as_deref())?;
    let (period, since) = recommendation_period(query.period.as_deref())?;
    let (offset, limit) = recommendation_page(query.offset, query.limit)?;
    let cache_key = format!(
        "community:{}:{}:{}:{}:{}:{}",
        current.user.id,
        kind.unwrap_or("all"),
        sort,
        period,
        offset,
        limit
    );
    if let Some(value) = state.recommendations.get(&cache_key) {
        return Ok(Json(value));
    }
    let order = match sort {
        "new" => "updated_at desc",
        "popular" => "people_count desc, average_rating desc, updated_at desc",
        _ => "average_rating desc, people_count desc, updated_at desc",
    };
    let sql = format!(
        "with candidates as (
            select
                i.id, i.slug, i.kind, i.title, i.subtitle, i.year, i.status,
                i.rating, i.review, i.cover_key, i.external_source, i.external_id,
                i.details, i.updated_at,
                u.id as user_id, u.handle, u.display_name
            from items i
            join users u on u.id = i.user_id
            where i.user_id <> $1
              and ($2::text is null or i.kind = $2)
              and ($3::timestamptz is null or i.updated_at >= $3)
              and u.is_public and u.deleted_at is null
              and not exists (
                  select 1 from hidden_recommendations hr
                  join items hidden_item on hidden_item.id = hr.item_id
                  where hr.user_id = $1
                    and (
                        (i.external_source is not null
                         and hidden_item.external_source = i.external_source
                         and hidden_item.external_id = i.external_id)
                        or lower(hidden_item.title) = lower(i.title)
                    )
              )
              and i.status = 'done' and i.rating >= 8
              and not i.public_hidden and i.deleted_at is null
              and 'done' = ANY(u.public_statuses)
              and not exists (
                  select 1 from items mine
                  where mine.user_id = $1 and mine.deleted_at is null
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
         ),
         grouped as (
            select
                (array_agg(id order by rating desc, updated_at desc))[1] as id,
                (array_agg(slug order by rating desc, updated_at desc))[1] as slug,
                (array_agg(kind order by rating desc, updated_at desc))[1] as kind,
                (array_agg(title order by rating desc, updated_at desc))[1] as title,
                (array_agg(subtitle order by rating desc, updated_at desc))[1] as subtitle,
                (array_agg(year order by rating desc, updated_at desc))[1] as year,
                (array_agg(status order by rating desc, updated_at desc))[1] as status,
                (array_agg(rating order by rating desc, updated_at desc))[1] as rating,
                (array_agg(review order by rating desc, updated_at desc))[1] as review,
                (array_agg(cover_key order by rating desc, updated_at desc))[1] as cover_key,
                (array_agg(external_source order by rating desc, updated_at desc))[1] as external_source,
                (array_agg(external_id order by rating desc, updated_at desc))[1] as external_id,
                (array_agg(details order by rating desc, updated_at desc))[1] as details,
                (array_agg(updated_at order by rating desc, updated_at desc))[1] as updated_at,
                (array_agg(user_id order by rating desc, updated_at desc))[1] as author_id,
                (array_agg(handle order by rating desc, updated_at desc))[1] as author_handle,
                jsonb_agg(distinct jsonb_build_object(
                    'name', display_name, 'handle', handle
                )) as people,
                count(distinct user_id) as people_count,
                round(avg(rating)::numeric, 1) as average_rating
            from candidates
            group by coalesce(external_source || ':' || external_id, lower(title))
         )
         select jsonb_build_object(
            'id', id, 'slug', slug, 'author_id', author_id,
            'author_handle', author_handle, 'kind', kind, 'title', title,
            'subtitle', subtitle, 'year', year, 'status', status,
            'rating', rating, 'review', review, 'cover_key', cover_key,
            'external_source', external_source, 'external_id', external_id,
            'details', details, 'updated_at', updated_at,
            'people', people, 'people_count', people_count,
            'average_rating', average_rating
         )
         from grouped
         order by {order}
         limit $5 offset $4"
    );
    let items: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(current.user.id)
        .bind(kind)
        .bind(since)
        .bind(offset)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?;

    let count_rows: Vec<(String, i64)> = sqlx::query_as(
        "with candidates as (
            select i.kind, i.title, i.external_source, i.external_id
            from items i
            join users u on u.id = i.user_id
            where i.user_id <> $1
              and ($2::timestamptz is null or i.updated_at >= $2)
              and u.is_public and u.deleted_at is null
              and not exists (
                  select 1 from hidden_recommendations hr
                  join items hidden_item on hidden_item.id = hr.item_id
                  where hr.user_id = $1
                    and (
                        (i.external_source is not null
                         and hidden_item.external_source = i.external_source
                         and hidden_item.external_id = i.external_id)
                        or lower(hidden_item.title) = lower(i.title)
                    )
              )
              and i.status = 'done' and i.rating >= 8
              and not i.public_hidden and i.deleted_at is null
              and 'done' = ANY(u.public_statuses)
              and not exists (
                  select 1 from items mine
                  where mine.user_id = $1 and mine.deleted_at is null
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
         ),
         grouped as (
            select (array_agg(kind order by title))[1] as kind
            from candidates
            group by coalesce(external_source || ':' || external_id, lower(title))
         )
         select kind, count(*) from grouped group by kind",
    )
    .bind(current.user.id)
    .bind(since)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let next_offset = (items.len() as i64 == limit).then_some(offset + limit);
    let payload = json!({
        "items": items,
        "counts": counts_payload(count_rows),
        "next_offset": next_offset,
    });
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
             'slug', i.slug,
             'author_id', u.id,
             'author_name', u.display_name,
             'author_handle', u.handle,
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
