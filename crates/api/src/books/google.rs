//! Google Books fallback: better localized titles and descriptions.
//!
//! The API key is optional at the process level. Without it the fallback is
//! skipped and Open Library remains the only provider.

use std::time::Duration;

use reqwest::Client;
use serde_json::Value;

use super::openlibrary::{BookDetails, SearchItem};
use crate::error::AppError;

const BASE: &str = "https://www.googleapis.com/books/v1/volumes";

fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("jey.net/0.1 (personal catalogue)")
        .build()
        .unwrap_or_default()
}

fn year(value: Option<&str>) -> Option<i32> {
    value
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse().ok())
}

fn cover_url(volume: &Value) -> Option<String> {
    let raw = volume
        .get("imageLinks")
        .and_then(|links| {
            links
                .get("thumbnail")
                .or_else(|| links.get("smallThumbnail"))
                .and_then(Value::as_str)
        })?
        .replacen("http://", "https://", 1);

    // Google's `thumbnail` is zoom=1 (about 128×176). Ask the same CDN for
    // the largest render it exposes; this is still one request, not an image
    // upscale on our side.
    let upgraded = raw
        .split('&')
        .map(|part| {
            if part.starts_with("zoom=") {
                "zoom=3"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join("&");

    (upgraded.starts_with("https://books.google.com/")
        || upgraded.starts_with("https://books.googleusercontent.com/"))
    .then_some(upgraded)
}

fn isbn(volume: &Value) -> Option<String> {
    volume
        .get("industryIdentifiers")
        .and_then(Value::as_array)
        .and_then(|ids| {
            ids.iter()
                .find(|id| id.get("type").and_then(Value::as_str) == Some("ISBN_13"))
        })
        .or_else(|| {
            volume
                .get("industryIdentifiers")
                .and_then(Value::as_array)
                .and_then(|ids| {
                    ids.iter()
                        .find(|id| id.get("type").and_then(Value::as_str) == Some("ISBN_10"))
                })
        })
        .and_then(|id| id.get("identifier").and_then(Value::as_str))
        .map(str::to_owned)
}

fn strip_tags(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut inside = false;
    for ch in value.chars() {
        match ch {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_owned()
}

/// `GET /api/v1/books/search` fallback.
pub async fn search(query: &str, key: &str, locale: &str) -> Result<Vec<SearchItem>, AppError> {
    let response = client()
        .get(BASE)
        .query(&[
            ("q", query),
            ("maxResults", "8"),
            ("printType", "books"),
            ("langRestrict", locale),
            ("key", key),
        ])
        .send()
        .await
        .map_err(AppError::internal)?;

    if !response.status().is_success() {
        return Err(AppError::internal("Google Books search failed"));
    }

    let value: Value = response.json().await.map_err(AppError::internal)?;
    let mut results: Vec<SearchItem> = value
        .get("items")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let volume = item.get("volumeInfo")?;
                    let title = volume.get("title")?.as_str()?.trim().to_owned();
                    if title.is_empty() {
                        return None;
                    }
                    Some(SearchItem {
                        book_id: format!("gb:{}", item.get("id")?.as_str()?),
                        source: "googlebooks".to_owned(),
                        title,
                        authors: volume
                            .get("authors")
                            .and_then(Value::as_array)
                            .map(|authors| {
                                authors
                                    .iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_owned)
                                    .collect()
                            })
                            .unwrap_or_default(),
                        year: year(volume.get("publishedDate").and_then(Value::as_str)),
                        cover_id: None,
                        cover_url: cover_url(volume),
                        isbn: isbn(volume),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    results.sort_by_key(|item| item.cover_url.is_none());
    Ok(results)
}

pub async fn details(id: &str, key: &str) -> Result<BookDetails, AppError> {
    let volume_id = id
        .strip_prefix("gb:")
        .ok_or_else(|| AppError::validation_field("id", "invalid Google Books id"))?;
    if volume_id.is_empty() || volume_id.len() > 64 {
        return Err(AppError::validation_field("id", "invalid Google Books id"));
    }

    let response = client()
        .get(format!("{BASE}/{volume_id}"))
        .query(&[("key", key)])
        .send()
        .await
        .map_err(AppError::internal)?;
    if !response.status().is_success() {
        return Err(AppError::not_found("book not found"));
    }

    let value: Value = response.json().await.map_err(AppError::internal)?;
    let volume = value
        .get("volumeInfo")
        .ok_or_else(|| AppError::not_found("book not found"))?;

    Ok(BookDetails {
        book_id: format!("gb:{volume_id}"),
        source: "googlebooks".to_owned(),
        title: volume
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_owned(),
        authors: volume
            .get("authors")
            .and_then(Value::as_array)
            .map(|authors| {
                authors
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        year: year(volume.get("publishedDate").and_then(Value::as_str)),
        overview: volume
            .get("description")
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
            .map(strip_tags),
        publisher: volume
            .get("publisher")
            .and_then(Value::as_str)
            .map(str::to_owned),
        page_count: volume
            .get("pageCount")
            .and_then(Value::as_i64)
            .map(|pages| pages as i32),
        isbn: isbn(volume),
        cover_id: None,
        cover_url: cover_url(volume),
        subjects: volume
            .get("categories")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|subject| subject.chars().count() <= 40)
                    .take(8)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
    })
}

pub async fn cover(url: &str) -> Result<(String, Vec<u8>), AppError> {
    if !(url.starts_with("https://books.google.com/")
        || url.starts_with("https://books.googleusercontent.com/"))
    {
        return Err(AppError::validation_field("cover", "invalid cover URL"));
    }

    let response = client().get(url).send().await.map_err(AppError::internal)?;
    if !response.status().is_success() {
        return Err(AppError::not_found("cover not found"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_owned();
    let bytes = response.bytes().await.map_err(AppError::internal)?;
    Ok((content_type, bytes.to_vec()))
}
