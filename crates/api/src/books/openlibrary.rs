//! Open Library search and metadata.
//!
//! Open Library needs no key. Its search response already contains enough to
//! show a compact result; the work + first edition fill the details snapshot.

use std::time::Duration;

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;

const SEARCH_URL: &str = "https://openlibrary.org/search.json";
const COVERS_URL: &str = "https://covers.openlibrary.org/b/id";
const FIELDS: &str = "key,title,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median,subject,first_sentence";

#[derive(Debug, Clone, Serialize)]
pub struct SearchItem {
    pub book_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub cover_id: Option<i64>,
    pub isbn: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BookDetails {
    pub book_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub publisher: Option<String>,
    pub page_count: Option<i32>,
    pub isbn: Option<String>,
    pub cover_id: Option<i64>,
    pub subjects: Vec<String>,
}

fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("jey.net/0.1 (personal catalogue)")
        .build()
        .unwrap_or_default()
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn first_string(value: Option<&Value>) -> Option<String> {
    strings(value).into_iter().next()
}

fn work_id(key: &str) -> Option<String> {
    let id = key.trim_end_matches('/').rsplit('/').next()?.trim();
    if id.is_empty() || id.len() > 64 {
        return None;
    }
    Some(id.to_owned())
}

fn year_from(value: Option<&str>) -> Option<i32> {
    value
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse().ok())
}

fn description(value: &Value) -> Option<String> {
    match value.get("description") {
        Some(Value::String(text)) if !text.trim().is_empty() => Some(text.trim().to_owned()),
        Some(Value::Object(map)) => map
            .get("value")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        _ => None,
    }
}

/// `GET /api/v1/books/search?q=...`
pub async fn search(query: &str) -> Result<Vec<SearchItem>, AppError> {
    let response = client()
        .get(SEARCH_URL)
        .query(&[("q", query), ("limit", "8"), ("fields", FIELDS)])
        .send()
        .await
        .map_err(AppError::internal)?;

    if !response.status().is_success() {
        return Err(AppError::internal("Open Library search failed"));
    }

    let value: Value = response.json().await.map_err(AppError::internal)?;
    let docs = value
        .get("docs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(docs
        .iter()
        .filter_map(|doc| {
            let id = work_id(doc.get("key").and_then(Value::as_str)?)?;
            let title = doc.get("title").and_then(Value::as_str)?.trim().to_owned();
            if title.is_empty() {
                return None;
            }

            Some(SearchItem {
                book_id: id,
                title,
                authors: strings(doc.get("author_name")),
                year: doc
                    .get("first_publish_year")
                    .and_then(Value::as_i64)
                    .map(|year| year as i32),
                cover_id: doc.get("cover_i").and_then(Value::as_i64),
                isbn: first_string(doc.get("isbn")),
            })
        })
        .collect())
}

/// `GET /api/v1/books/{id}`
pub async fn details(book_id: &str) -> Result<BookDetails, AppError> {
    let id = work_id(book_id).ok_or_else(|| AppError::validation_field("id", "invalid work id"))?;
    let http = client();

    let work_response = http
        .get(format!("https://openlibrary.org/works/{id}.json"))
        .send()
        .await
        .map_err(AppError::internal)?;

    if !work_response.status().is_success() {
        return Err(AppError::not_found("book not found"));
    }

    let work: Value = work_response.json().await.map_err(AppError::internal)?;

    let editions_response = http
        .get(format!("https://openlibrary.org/works/{id}/editions.json"))
        .query(&[("limit", "5")])
        .send()
        .await
        .map_err(AppError::internal)?;

    let editions = if editions_response.status().is_success() {
        let editions: Value = editions_response.json().await.map_err(AppError::internal)?;
        editions
            .get("entries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let earliest_edition_year = editions
        .iter()
        .filter_map(|value| value.get("publish_date").and_then(Value::as_str))
        .filter_map(|date| year_from(Some(date)))
        .min();
    let edition = editions
        .iter()
        .find(|value| {
            value
                .get("publish_date")
                .and_then(Value::as_str)
                .and_then(|date| year_from(Some(date)))
                .is_some_and(|year| Some(year) == earliest_edition_year)
        })
        .or_else(|| editions.first())
        .cloned();

    let mut authors = Vec::new();
    if let Some(items) = work.get("authors").and_then(Value::as_array) {
        for item in items.iter().take(5) {
            let Some(key) = item
                .get("author")
                .and_then(|author| author.get("key"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            let author_response = http
                .get(format!("https://openlibrary.org{key}.json"))
                .send()
                .await
                .map_err(AppError::internal)?;
            if !author_response.status().is_success() {
                continue;
            }
            let author: Value = author_response.json().await.map_err(AppError::internal)?;
            if let Some(name) = author.get("name").and_then(Value::as_str) {
                if !name.trim().is_empty() {
                    authors.push(name.trim().to_owned());
                }
            }
        }
    }

    let cover_id = work
        .get("covers")
        .and_then(Value::as_array)
        .and_then(|covers| covers.first())
        .and_then(Value::as_i64)
        .or_else(|| {
            edition
                .as_ref()
                .and_then(|value| value.get("covers"))
                .and_then(Value::as_array)
                .and_then(|covers| covers.first())
                .and_then(Value::as_i64)
        });

    let publisher = edition
        .as_ref()
        .and_then(|value| value.get("publishers"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .map(str::to_owned);

    let isbn = edition
        .as_ref()
        .and_then(|value| {
            value
                .get("isbn_13")
                .and_then(Value::as_array)
                .or_else(|| value.get("isbn_10").and_then(Value::as_array))
        })
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .map(str::to_owned);

    let year = year_from(work.get("first_publish_date").and_then(Value::as_str))
        .or(earliest_edition_year)
        .or_else(|| {
            edition
                .as_ref()
                .and_then(|value| value.get("publish_date"))
                .and_then(Value::as_str)
                .and_then(|date| year_from(Some(date)))
        });

    Ok(BookDetails {
        book_id: id,
        title: work
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_owned(),
        authors,
        year,
        overview: description(&work),
        publisher,
        page_count: edition
            .as_ref()
            .and_then(|value| value.get("number_of_pages"))
            .and_then(Value::as_i64)
            .map(|pages| pages as i32),
        isbn,
        cover_id,
        subjects: strings(work.get("subjects"))
            .into_iter()
            .filter(|subject| {
                subject.len() <= 80
                    && !subject.contains('=')
                    && !subject.to_lowercase().contains("award")
            })
            .take(8)
            .collect(),
    })
}

/// Public cover proxy, so the browser never talks to Open Library.
pub async fn cover(cover_id: i64, size: &str) -> Result<(String, Vec<u8>), AppError> {
    if cover_id <= 0 || !matches!(size, "S" | "M" | "L") {
        return Err(AppError::validation_field("cover", "invalid cover"));
    }

    let response = client()
        .get(format!("{COVERS_URL}/{cover_id}-{size}.jpg"))
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
    let bytes = response.bytes().await.map_err(AppError::internal)?;

    Ok((content_type, bytes.to_vec()))
}
