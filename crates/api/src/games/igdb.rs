//! IGDB v4 client with a cached Twitch app token.
//!
//! Twitch/IGDB credentials stay server-side. The token is refreshed lazily and
//! cached in memory until shortly before it expires.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;
use crate::movies::tmdb::SimilarItem;
use jey_core::items::MovieDetails;

const API: &str = "https://api.igdb.com/v4";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const SEARCH_TTL: Duration = Duration::from_secs(15 * 60);
const DETAILS_TTL: Duration = Duration::from_secs(60 * 60);
const CACHE_CAPACITY: usize = 200;

#[derive(Debug, Clone, Serialize)]
pub struct SearchItem {
    pub igdb_id: u64,
    pub title: String,
    pub year: Option<i32>,
    pub cover_url: Option<String>,
    pub platforms: Vec<String>,
    pub summary: Option<String>,
}

pub struct IgdbClient {
    client: Client,
    client_id: Option<String>,
    client_secret: Option<String>,
    token: Mutex<Option<(String, Instant)>>,
    search_cache: Mutex<HashMap<String, (Instant, Vec<SearchItem>)>>,
    details_cache: Mutex<HashMap<String, (Instant, MovieDetails)>>,
    permits: Arc<tokio::sync::Semaphore>,
}

impl IgdbClient {
    pub fn new(client_id: Option<String>, client_secret: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(12))
                .user_agent("jey.net/0.1 (personal catalogue)")
                .build()
                .unwrap_or_default(),
            client_id,
            client_secret,
            token: Mutex::new(None),
            search_cache: Mutex::new(HashMap::new()),
            details_cache: Mutex::new(HashMap::new()),
            permits: Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }

    pub fn configured(&self) -> bool {
        self.client_id.is_some() && self.client_secret.is_some()
    }

    async fn token(&self) -> Result<(String, String), AppError> {
        let client_id = self
            .client_id
            .clone()
            .ok_or_else(|| AppError::unavailable("IGDB is not configured"))?;
        if let Some((token, until)) = self
            .token
            .lock()
            .map_err(|_| AppError::internal("IGDB token lock is poisoned"))?
            .as_ref()
            && *until > Instant::now()
        {
            return Ok((client_id, token.clone()));
        }

        let secret = self
            .client_secret
            .as_deref()
            .ok_or_else(|| AppError::unavailable("IGDB is not configured"))?;
        let value = self
            .client
            .post(TOKEN_URL)
            .query(&[
                ("client_id", client_id.as_str()),
                ("client_secret", secret),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(AppError::internal)?
            .error_for_status()
            .map_err(AppError::internal)?
            .json::<Value>()
            .await
            .map_err(AppError::internal)?;
        let token = value
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::internal("IGDB token response is missing access_token"))?
            .to_owned();
        let expires_in = value
            .get("expires_in")
            .and_then(Value::as_u64)
            .unwrap_or(3600);
        let until = Instant::now() + Duration::from_secs(expires_in.saturating_sub(60));
        *self
            .token
            .lock()
            .map_err(|_| AppError::internal("IGDB token lock is poisoned"))? =
            Some((token.clone(), until));
        Ok((client_id, token))
    }

    async fn query(&self, path: &str, body: String) -> Result<Vec<Value>, AppError> {
        let (client_id, token) = self.token().await?;
        let response = self
            .client
            .post(format!("{API}/{path}"))
            .header("Client-ID", client_id)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "text/plain")
            .body(body)
            .send()
            .await
            .map_err(AppError::internal)?;
        if !response.status().is_success() {
            return Err(AppError::internal("IGDB request failed"));
        }
        let value = response.json::<Value>().await.map_err(AppError::internal)?;
        Ok(value.as_array().cloned().unwrap_or_default())
    }

    pub async fn search_cached(&self, query: &str) -> Result<Vec<SearchItem>, AppError> {
        if let Some(value) = self.cached_search(query) {
            return Ok(value);
        }
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::internal("IGDB request limiter is closed"))?;
        if let Some(value) = self.cached_search(query) {
            return Ok(value);
        }
        let value = self.search(query).await?;
        if let Ok(mut cache) = self.search_cache.lock() {
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
            cache.insert(query.to_owned(), (Instant::now(), value.clone()));
        }
        Ok(value)
    }

    pub async fn details_cached(&self, id: u64) -> Result<MovieDetails, AppError> {
        let key = id.to_string();
        if let Some(value) = self.cached_details(&key) {
            return Ok(value);
        }
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::internal("IGDB request limiter is closed"))?;
        if let Some(value) = self.cached_details(&key) {
            return Ok(value);
        }
        let value = self.details(id).await?;
        if let Ok(mut cache) = self.details_cache.lock() {
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
            cache.insert(key, (Instant::now(), value.clone()));
        }
        Ok(value)
    }

    fn cached_search(&self, query: &str) -> Option<Vec<SearchItem>> {
        let cache = self.search_cache.lock().ok()?;
        let (at, value) = cache.get(query)?;
        (at.elapsed() < SEARCH_TTL).then(|| value.clone())
    }

    fn cached_details(&self, id: &str) -> Option<MovieDetails> {
        let cache = self.details_cache.lock().ok()?;
        let (at, value) = cache.get(id)?;
        (at.elapsed() < DETAILS_TTL).then(|| value.clone())
    }

    pub async fn search(&self, query: &str) -> Result<Vec<SearchItem>, AppError> {
        let escaped = query.replace('"', "\\\"");
        let body = format!(
            "search \"{escaped}\"; fields name,first_release_date,cover.url,summary,platforms.name; limit 8;"
        );
        let rows = self.query("games", body).await?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                let id = row.get("id").and_then(Value::as_u64)?;
                let title = row.get("name").and_then(Value::as_str)?.trim().to_owned();
                (!title.is_empty()).then(|| SearchItem {
                    igdb_id: id,
                    title,
                    year: year(row.get("first_release_date").and_then(Value::as_i64)),
                    cover_url: cover(row),
                    platforms: names(row.get("platforms")),
                    summary: row
                        .get("summary")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                })
            })
            .collect())
    }

    pub async fn details(&self, id: u64) -> Result<MovieDetails, AppError> {
        let body = format!(
            "fields name,summary,first_release_date,cover.url,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,total_rating,total_rating_count,aggregated_rating; where id = {id}; limit 1;"
        );
        let row = self
            .query("games", body)
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::not_found("game not found"))?;
        let title = row
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_owned();
        let developers = companies(&row, true, false);
        let publishers = companies(&row, false, true);
        let rating = row
            .get("total_rating")
            .and_then(Value::as_f64)
            .map(|value| value.round() as i16);
        Ok(MovieDetails {
            original_title: title.clone(),
            overview: row
                .get("summary")
                .and_then(Value::as_str)
                .map(str::to_owned),
            tagline: None,
            runtime: None,
            release_date: row
                .get("first_release_date")
                .and_then(Value::as_i64)
                .and_then(timestamp_date),
            status: None,
            director: (!developers.is_empty()).then(|| developers.join(", ")),
            authors: Vec::new(),
            publisher: publishers.first().cloned(),
            page_count: None,
            isbn: None,
            cover_id: None,
            cover_url: cover(&row),
            platforms: names(row.get("platforms")),
            developers,
            publishers,
            anime_format: None,
            anime_season: None,
            cast: Vec::new(),
            genres: names(row.get("genres")),
            countries: Vec::new(),
            languages: Vec::new(),
            companies: Vec::new(),
            budget: None,
            revenue: None,
            imdb_id: None,
            vote_average_tenths: rating,
            vote_count: row.get("total_rating_count").and_then(Value::as_i64),
            translations: Default::default(),
            number_of_seasons: None,
            number_of_episodes: None,
            seasons: Vec::new(),
            watched_episodes: Vec::new(),
        })
    }

    pub async fn similar(&self, id: u64) -> Result<Vec<SimilarItem>, AppError> {
        let row = self
            .query(
                "games",
                format!("fields similar_games; where id = {id}; limit 1;"),
            )
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::not_found("game not found"))?;
        let ids: Vec<String> = row
            .get("similar_games")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_u64)
                    .take(12)
                    .map(|value| value.to_string())
                    .collect()
            })
            .unwrap_or_default();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows = self
            .query(
                "games",
                format!(
                    "fields name,first_release_date,cover.url; where id = ({}); limit 12;",
                    ids.join(",")
                ),
            )
            .await?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                let id = row.get("id").and_then(Value::as_u64)?;
                let title = row.get("name").and_then(Value::as_str)?.to_owned();
                Some(SimilarItem {
                    source: "igdb".to_owned(),
                    external_id: id.to_string(),
                    title,
                    year: year(row.get("first_release_date").and_then(Value::as_i64)),
                    poster_path: None,
                    cover_url: cover(row),
                    cover_id: None,
                    kind: "game".to_owned(),
                    href: format!("https://www.igdb.com/games/{id}"),
                })
            })
            .collect())
    }

    pub async fn cover(&self, url: &str) -> Result<(String, Vec<u8>), AppError> {
        if !url.starts_with("https://images.igdb.com/") {
            return Err(AppError::validation_field(
                "cover",
                "invalid IGDB cover URL",
            ));
        }
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(AppError::internal)?;
        if !response.status().is_success() {
            return Err(AppError::not_found("cover not found"));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_owned();
        Ok((
            content_type,
            response.bytes().await.map_err(AppError::internal)?.to_vec(),
        ))
    }
}

fn year(timestamp: Option<i64>) -> Option<i32> {
    timestamp
        .and_then(|value| {
            chrono::DateTime::from_timestamp(value, 0).map(|date| date.format("%Y").to_string())
        })
        .and_then(|year| year.parse().ok())
}

fn timestamp_date(timestamp: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|date| date.format("%Y-%m-%d").to_string())
}

fn names(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn cover(row: &Value) -> Option<String> {
    let url = row.get("cover")?.get("url")?.as_str()?;
    let url = url.replacen("//", "https://", 1);
    Some(url.replace("t_thumb", "t_cover_big_2x"))
}

fn companies(row: &Value, developer: bool, publisher: bool) -> Vec<String> {
    row.get("involved_companies")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| {
                    (!developer || item.get("developer").and_then(Value::as_bool) == Some(true))
                        && (!publisher
                            || item.get("publisher").and_then(Value::as_bool) == Some(true))
                })
                .filter_map(|item| {
                    item.get("company")?
                        .get("name")?
                        .as_str()
                        .map(str::to_owned)
                })
                .collect()
        })
        .unwrap_or_default()
}
