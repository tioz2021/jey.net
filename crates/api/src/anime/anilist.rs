//! AniList GraphQL: primary anime metadata source.

use std::time::Duration;

use reqwest::Client;
use serde_json::{Value, json};

use super::SearchItem;
use crate::error::AppError;
use crate::movies::tmdb::SimilarItem;
use jey_core::items::MovieDetails;

const ENDPOINT: &str = "https://graphql.anilist.co";

fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("jey.net/0.1 (personal catalogue)")
        .build()
        .unwrap_or_default()
}

async fn graphql(query: &str, variables: Value) -> Result<Value, AppError> {
    let value = client()
        .post(ENDPOINT)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(AppError::internal)?
        .error_for_status()
        .map_err(AppError::internal)?
        .json::<Value>()
        .await
        .map_err(AppError::internal)?;
    if value.get("errors").is_some() {
        return Err(AppError::internal("AniList returned an error"));
    }
    Ok(value)
}

fn media_fields() -> &'static str {
    "id title { romaji english native } startDate { year } coverImage { extraLarge large } format episodes duration status description(asHtml: false) genres studios(isMain: true) { nodes { name } } averageScore"
}

fn title(media: &Value) -> Option<String> {
    let titles = media.get("title")?;
    ["romaji", "english", "native"]
        .iter()
        .find_map(|key| titles.get(*key).and_then(Value::as_str))
        .map(str::to_owned)
}

fn cover(media: &Value) -> Option<String> {
    media
        .get("coverImage")
        .and_then(|image| image.get("extraLarge").or_else(|| image.get("large")))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn year(media: &Value) -> Option<i32> {
    media
        .get("startDate")
        .and_then(|date| date.get("year"))
        .and_then(Value::as_i64)
        .map(|year| year as i32)
}

fn names(media: &Value, key: &str) -> Vec<String> {
    media
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn studios(media: &Value) -> Vec<String> {
    media
        .get("studios")
        .and_then(|value| value.get("nodes"))
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| node.get("name").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub async fn search(query: &str) -> Result<Vec<SearchItem>, AppError> {
    let body = format!(
        "query ($search: String) {{ Page(perPage: 8) {{ media(search: $search, type: ANIME) {{ {} }} }} }}",
        media_fields()
    );
    let value = graphql(body.as_str(), json!({ "search": query })).await?;
    Ok(value
        .pointer("/data/Page/media")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|media| {
                    let id = media.get("id").and_then(Value::as_u64)?;
                    let title = title(media)?;
                    Some(SearchItem {
                        anime_id: format!("al:{id}"),
                        source: "anilist".to_owned(),
                        title,
                        year: year(media),
                        cover_url: cover(media),
                        format: media
                            .get("format")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        episodes: media
                            .get("episodes")
                            .and_then(Value::as_i64)
                            .map(|value| value as i32),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn similar(id: u64) -> Result<Vec<SimilarItem>, AppError> {
    let body = "query ($id: Int) { Media(id: $id, type: ANIME) { recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { id title { romaji english native } startDate { year } coverImage { extraLarge large } } } } } }";
    let value = graphql(body, json!({ "id": id })).await?;
    Ok(value
        .pointer("/data/Media/recommendations/nodes")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| {
                    let media = node.get("mediaRecommendation")?;
                    let id = media.get("id").and_then(Value::as_u64)?;
                    let title = title(media)?;
                    Some(SimilarItem {
                        source: "anilist".to_owned(),
                        external_id: id,
                        title,
                        year: year(media),
                        poster_path: None,
                        cover_url: cover(media),
                        kind: "anime".to_owned(),
                        href: format!("https://anilist.co/anime/{id}"),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn details(id: u64) -> Result<MovieDetails, AppError> {
    let body = format!(
        "query ($id: Int) {{ Media(id: $id, type: ANIME) {{ {} }} }}",
        media_fields()
    );
    let value = graphql(body.as_str(), json!({ "id": id })).await?;
    let media = value
        .pointer("/data/Media")
        .ok_or_else(|| AppError::not_found("anime not found"))?;
    let title = title(media).ok_or_else(|| AppError::not_found("anime not found"))?;
    let studios = studios(media);
    let score = media
        .get("averageScore")
        .and_then(Value::as_i64)
        .map(|value| value as i16);
    let year = year(media);
    Ok(MovieDetails {
        original_title: title.clone(),
        overview: media
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned),
        tagline: None,
        runtime: media
            .get("duration")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
        release_date: year.map(|year| format!("{year}-01-01")),
        status: media
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
        director: studios.first().cloned(),
        authors: Vec::new(),
        publisher: None,
        page_count: None,
        isbn: None,
        cover_id: None,
        cover_url: cover(media),
        platforms: Vec::new(),
        developers: Vec::new(),
        publishers: Vec::new(),
        anime_format: media
            .get("format")
            .and_then(Value::as_str)
            .map(str::to_owned),
        anime_season: None,
        cast: Vec::new(),
        genres: names(media, "genres"),
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
        number_of_episodes: media
            .get("episodes")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
        seasons: Vec::new(),
        watched_episodes: Vec::new(),
    })
}
