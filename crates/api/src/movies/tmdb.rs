//! Thin TMDB client: search, details and an in-memory day-long cache.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::Url;
use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;

const BASE: &str = "https://api.themoviedb.org/3";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const CACHE_CAPACITY: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct SearchItem {
    pub tmdb_id: u64,
    pub title: String,
    pub original_title: String,
    pub year: Option<i32>,
    pub poster_path: Option<String>,
    pub overview: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MovieDetails {
    pub tmdb_id: u64,
    pub title: String,
    pub original_title: String,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub runtime: Option<i32>,
    pub poster_path: Option<String>,
    pub director: Option<String>,
    pub cast: Vec<String>,
    pub genres: Vec<String>,
}

struct Cached {
    at: Instant,
    value: Value,
}

pub struct TmdbClient {
    client: reqwest::Client,
    token: Option<String>,
    cache: Mutex<HashMap<String, Cached>>,
}

impl TmdbClient {
    pub fn new(token: Option<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            token,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn configured(&self) -> bool {
        self.token.is_some()
    }

    pub async fn search(&self, query: &str, language: &str) -> Result<Vec<SearchItem>, AppError> {
        let value = self
            .get_json(
                "search/movie",
                &[
                    ("query", query),
                    ("language", language),
                    ("include_adult", "false"),
                ],
            )
            .await?;

        Ok(value
            .get("results")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(parse_search_item).collect())
            .unwrap_or_default())
    }

    pub async fn details(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        let value = self
            .get_json(
                &format!("movie/{id}"),
                &[("language", language), ("append_to_response", "credits")],
            )
            .await?;

        parse_details(&value).ok_or_else(|| AppError::not_found("movie not found"))
    }

    async fn get_json(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, AppError> {
        let mut url = Url::parse(&format!("{BASE}/{path}")).map_err(AppError::internal)?;
        url.query_pairs_mut().extend_pairs(query);

        let key = url.to_string();
        if let Some(value) = self.cached(&key) {
            return Ok(value);
        }

        let token = self
            .token
            .as_deref()
            .ok_or_else(|| AppError::internal("TMDB is not configured"))?;

        let response = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(AppError::internal)?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::not_found("movie not found"));
        }
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::rate_limited("TMDB rate limit reached", 60));
        }
        if !response.status().is_success() {
            tracing::warn!(status = %response.status(), "TMDB request failed");
            return Err(AppError::internal("TMDB request failed"));
        }

        let value: Value = response.json().await.map_err(AppError::internal)?;
        self.remember(key, value.clone());
        Ok(value)
    }

    fn cached(&self, key: &str) -> Option<Value> {
        let cache = self.cache.lock().ok()?;
        let entry = cache.get(key)?;
        if entry.at.elapsed() > CACHE_TTL {
            return None;
        }

        Some(entry.value.clone())
    }

    fn remember(&self, key: String, value: Value) {
        let Ok(mut cache) = self.cache.lock() else {
            return;
        };

        if cache.len() >= CACHE_CAPACITY {
            cache.retain(|_, entry| entry.at.elapsed() <= CACHE_TTL);
            if cache.len() >= CACHE_CAPACITY {
                cache.clear();
            }
        }

        cache.insert(
            key,
            Cached {
                at: Instant::now(),
                value,
            },
        );
    }
}

fn parse_search_item(value: &Value) -> Option<SearchItem> {
    Some(SearchItem {
        tmdb_id: value.get("id")?.as_u64()?,
        title: value.get("title")?.as_str()?.to_owned(),
        original_title: value
            .get("original_title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        year: value
            .get("release_date")
            .and_then(Value::as_str)
            .and_then(|date| date.get(..4))
            .and_then(|year| year.parse().ok()),
        poster_path: value
            .get("poster_path")
            .and_then(Value::as_str)
            .map(str::to_owned),
        overview: value
            .get("overview")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
    })
}

fn parse_details(value: &Value) -> Option<MovieDetails> {
    let credits = value.get("credits");
    let crew = credits
        .and_then(|credits| credits.get("crew"))
        .and_then(Value::as_array);
    let cast = credits
        .and_then(|credits| credits.get("cast"))
        .and_then(Value::as_array);

    let director = crew.and_then(|crew| {
        crew.iter()
            .find(|person| person.get("job").and_then(Value::as_str) == Some("Director"))
            .and_then(|person| person.get("name"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    });

    Some(MovieDetails {
        tmdb_id: value.get("id")?.as_u64()?,
        title: value.get("title")?.as_str()?.to_owned(),
        original_title: value
            .get("original_title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        year: value
            .get("release_date")
            .and_then(Value::as_str)
            .and_then(|date| date.get(..4))
            .and_then(|year| year.parse().ok()),
        overview: value
            .get("overview")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        runtime: value
            .get("runtime")
            .and_then(Value::as_i64)
            .map(|minutes| minutes as i32),
        poster_path: value
            .get("poster_path")
            .and_then(Value::as_str)
            .map(str::to_owned),
        director,
        cast: cast
            .map(|people| {
                people
                    .iter()
                    .take(10)
                    .filter_map(|person| person.get("name").and_then(Value::as_str))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        genres: value
            .get("genres")
            .and_then(Value::as_array)
            .map(|genres| {
                genres
                    .iter()
                    .filter_map(|genre| genre.get("name").and_then(Value::as_str))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn search_item_is_normalised() {
        let item = parse_search_item(&json!({
            "id": 49018,
            "title": "Астрал",
            "original_title": "Insidious",
            "release_date": "2011-04-01",
            "poster_path": "/poster.jpg",
            "overview": "Семья переезжает..."
        }))
        .expect("item");

        assert_eq!(item.tmdb_id, 49018);
        assert_eq!(item.title, "Астрал");
        assert_eq!(item.year, Some(2011));
        assert_eq!(item.poster_path.as_deref(), Some("/poster.jpg"));
    }

    #[test]
    fn details_pick_director_cast_and_genres() {
        let movie = parse_details(&json!({
            "id": 49018,
            "title": "Астрал",
            "original_title": "Insidious",
            "release_date": "2011-04-01",
            "runtime": 103,
            "genres": [{ "id": 27, "name": "Ужасы" }],
            "credits": {
                "crew": [{ "job": "Director", "name": "Джеймс Ван" }],
                "cast": [
                    { "name": "Патрик Уилсон" },
                    { "name": "Роуз Бирн" }
                ]
            }
        }))
        .expect("details");

        assert_eq!(movie.director.as_deref(), Some("Джеймс Ван"));
        assert_eq!(movie.cast, vec!["Патрик Уилсон", "Роуз Бирн"]);
        assert_eq!(movie.genres, vec!["Ужасы"]);
        assert_eq!(movie.runtime, Some(103));
    }

    #[test]
    fn missing_id_is_not_a_movie() {
        assert!(parse_search_item(&json!({ "title": "x" })).is_none());
        assert!(parse_details(&json!({ "title": "x" })).is_none());
    }
}
