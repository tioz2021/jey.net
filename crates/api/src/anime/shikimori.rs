//! Shikimori: Russian titles and descriptions, with no API key.

use std::time::Duration;

use reqwest::Client;
use serde_json::Value;

use super::SearchItem;
use crate::error::AppError;
use jey_core::items::MovieDetails;

const BASE: &str = "https://shikimori.one/api";
const USER_AGENT: &str = "jey.net/0.1 (personal catalogue)";

fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent(USER_AGENT)
        .build()
        .unwrap_or_default()
}

fn title(value: &Value) -> Option<String> {
    value
        .get("russian")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .or_else(|| value.get("name").and_then(Value::as_str))
        .map(str::to_owned)
}

fn cover(value: &Value) -> Option<String> {
    value
        .get("image")
        .and_then(|image| image.get("original"))
        .and_then(Value::as_str)
        .map(|path| format!("https://shikimori.one{path}"))
}

fn year(value: &Value) -> Option<i32> {
    value
        .get("aired_on")
        .and_then(Value::as_str)
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse().ok())
}

fn list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.get("russian")
                        .and_then(Value::as_str)
                        .filter(|name| !name.trim().is_empty())
                        .or_else(|| item.get("name").and_then(Value::as_str))
                })
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub async fn search(query: &str) -> Result<Vec<SearchItem>, AppError> {
    let response = client()
        .get(format!("{BASE}/animes"))
        .query(&[("search", query), ("limit", "8")])
        .send()
        .await
        .map_err(AppError::internal)?;
    if !response.status().is_success() {
        return Err(AppError::internal("Shikimori search failed"));
    }
    let value: Value = response.json().await.map_err(AppError::internal)?;
    let items = value.as_array().cloned().unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(Value::as_u64)?;
            let title = title(item)?;
            Some(SearchItem {
                anime_id: format!("sh:{id}"),
                source: "shikimori".to_owned(),
                title,
                year: year(item),
                cover_url: cover(item),
                format: item.get("kind").and_then(Value::as_str).map(str::to_owned),
                episodes: item
                    .get("episodes")
                    .and_then(Value::as_i64)
                    .map(|value| value as i32),
            })
        })
        .collect())
}

pub async fn details(id: u64) -> Result<MovieDetails, AppError> {
    let response = client()
        .get(format!("{BASE}/animes/{id}"))
        .send()
        .await
        .map_err(AppError::internal)?;
    if !response.status().is_success() {
        return Err(AppError::not_found("anime not found"));
    }
    let value: Value = response.json().await.map_err(AppError::internal)?;
    let title = title(&value).ok_or_else(|| AppError::not_found("anime not found"))?;
    let studios = list(value.get("studios"));
    let score = value
        .get("score")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| (value * 10.0).round() as i16);
    let release_date = value
        .get("aired_on")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Ok(MovieDetails {
        original_title: title.clone(),
        overview: value
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned),
        tagline: None,
        runtime: value
            .get("duration")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
        release_date,
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
        director: studios.first().cloned(),
        authors: Vec::new(),
        publisher: None,
        page_count: None,
        isbn: None,
        cover_id: None,
        cover_url: cover(&value),
        platforms: Vec::new(),
        developers: Vec::new(),
        publishers: Vec::new(),
        anime_format: value.get("kind").and_then(Value::as_str).map(str::to_owned),
        anime_season: None,
        cast: Vec::new(),
        genres: list(value.get("genres")),
        countries: Vec::new(),
        languages: Vec::new(),
        companies: studios,
        budget: None,
        revenue: None,
        imdb_id: None,
        vote_average_tenths: score,
        vote_count: None,
        translations: Default::default(),
        number_of_seasons: None,
        number_of_episodes: value
            .get("episodes")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
        seasons: Vec::new(),
        watched_episodes: Vec::new(),
    })
}
