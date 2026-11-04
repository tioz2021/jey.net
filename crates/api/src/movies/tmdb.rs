//! Thin TMDB client: search, details and an in-memory day-long cache.

use std::collections::{BTreeMap, HashMap};
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
pub struct SimilarItem {
    pub source: String,
    pub external_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub poster_path: Option<String>,
    pub cover_url: Option<String>,
    pub cover_id: Option<i64>,
    pub kind: String,
    pub href: String,
}

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
pub struct CastMember {
    pub tmdb_id: u64,
    pub name: String,
    pub character: Option<String>,
    pub profile_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MovieDetails {
    pub tmdb_id: u64,
    pub title: String,
    pub original_title: String,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub tagline: Option<String>,
    pub runtime: Option<i32>,
    pub release_date: Option<String>,
    pub status: Option<String>,
    pub poster_path: Option<String>,
    pub director: Option<String>,
    pub cast: Vec<CastMember>,
    pub genres: Vec<String>,
    pub countries: Vec<String>,
    pub languages: Vec<String>,
    pub companies: Vec<String>,
    pub budget: Option<i64>,
    pub revenue: Option<i64>,
    pub imdb_id: Option<String>,
    pub vote_average_tenths: Option<i16>,
    pub vote_count: Option<i64>,
    pub translations: BTreeMap<String, jey_core::items::MovieTranslation>,
    pub number_of_seasons: Option<i32>,
    pub number_of_episodes: Option<i32>,
    pub seasons: Vec<jey_core::items::SeasonSummary>,
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
                false,
            )
            .await?;

        Ok(value
            .get("results")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(parse_search_item).collect())
            .unwrap_or_default())
    }

    pub async fn details(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        self.details_inner(id, language, false).await
    }

    /// Bypasses the cache: used by "refresh from TMDB".
    pub async fn details_fresh(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        self.details_all_inner(id, language, true).await
    }

    /// Fetches the primary language plus ru/uk/en variants for the snapshot.
    pub async fn details_all(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        self.details_all_inner(id, language, false).await
    }

    async fn details_all_inner(
        &self,
        id: u64,
        language: &str,
        force: bool,
    ) -> Result<MovieDetails, AppError> {
        let primary = self.details_inner(id, language, force).await?;
        let mut translations = BTreeMap::new();
        translations.insert(language_key(language), primary.translation());

        for code in ["ru-RU", "uk-UA", "en-US"] {
            if language_key(code) == language_key(language) {
                continue;
            }
            if let Ok(movie) = self.details_inner(id, code, force).await {
                translations.insert(language_key(code), movie.translation());
            }
        }

        let mut movie = primary;
        movie.translations = translations;
        Ok(movie)
    }

    pub async fn search_tv(
        &self,
        query: &str,
        language: &str,
    ) -> Result<Vec<SearchItem>, AppError> {
        let value = self
            .get_json(
                "search/tv",
                &[
                    ("query", query),
                    ("language", language),
                    ("include_adult", "false"),
                ],
                false,
            )
            .await?;

        Ok(value
            .get("results")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(parse_tv_search_item).collect())
            .unwrap_or_default())
    }

    pub async fn tv_details(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        let value = self
            .get_json(
                &format!("tv/{id}"),
                &[
                    ("language", language),
                    ("append_to_response", "credits,external_ids"),
                ],
                false,
            )
            .await?;

        parse_tv_details(&value).ok_or_else(|| AppError::not_found("series not found"))
    }

    pub async fn tv_details_all(&self, id: u64, language: &str) -> Result<MovieDetails, AppError> {
        let primary = self.tv_details(id, language).await?;
        let mut translations = BTreeMap::new();
        translations.insert(language_key(language), primary.translation());

        for code in ["ru-RU", "uk-UA", "en-US"] {
            if language_key(code) == language_key(language) {
                continue;
            }
            if let Ok(series) = self.tv_details(id, code).await {
                translations.insert(language_key(code), series.translation());
            }
        }

        let mut series = primary;
        series.translations = translations;
        Ok(series)
    }

    pub async fn season(
        &self,
        id: u64,
        season_number: i32,
        language: &str,
    ) -> Result<TvSeason, AppError> {
        let value = self
            .get_json(
                &format!("tv/{id}/season/{season_number}"),
                &[("language", language)],
                false,
            )
            .await?;

        let episodes = value
            .get("episodes")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|episode| {
                        Some(TvEpisode {
                            episode_number: episode.get("episode_number")?.as_i64()? as i32,
                            name: episode
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_owned(),
                            overview: episode
                                .get("overview")
                                .and_then(Value::as_str)
                                .filter(|text| !text.is_empty())
                                .map(str::to_owned),
                            air_date: episode
                                .get("air_date")
                                .and_then(Value::as_str)
                                .filter(|date| !date.is_empty())
                                .map(str::to_owned),
                            runtime: episode
                                .get("runtime")
                                .and_then(Value::as_i64)
                                .map(|minutes| minutes as i32),
                            still_path: episode
                                .get("still_path")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(TvSeason {
            season_number,
            name: value
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            episodes,
        })
    }

    pub async fn similar(
        &self,
        media: &str,
        id: u64,
        language: &str,
    ) -> Result<Vec<SimilarItem>, AppError> {
        let value = self
            .get_json(
                &format!("{media}/{id}/recommendations"),
                &[("language", language)],
                false,
            )
            .await?;
        Ok(value
            .get("results")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        let id = item.get("id").and_then(Value::as_u64)?;
                        let title = item
                            .get("title")
                            .or_else(|| item.get("name"))
                            .and_then(Value::as_str)?
                            .to_owned();
                        let date = item
                            .get("release_date")
                            .or_else(|| item.get("first_air_date"))
                            .and_then(Value::as_str);
                        Some(SimilarItem {
                            source: "tmdb".to_owned(),
                            external_id: id.to_string(),
                            title,
                            year: date
                                .and_then(|date| date.get(..4))
                                .and_then(|year| year.parse().ok()),
                            poster_path: item
                                .get("poster_path")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                            cover_url: None,
                            cover_id: None,
                            kind: media.to_owned(),
                            href: format!("https://www.themoviedb.org/{media}/{id}"),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    async fn details_inner(
        &self,
        id: u64,
        language: &str,
        force: bool,
    ) -> Result<MovieDetails, AppError> {
        let value = self
            .get_json(
                &format!("movie/{id}"),
                &[
                    ("language", language),
                    ("append_to_response", "credits,external_ids"),
                ],
                force,
            )
            .await?;

        parse_details(&value).ok_or_else(|| AppError::not_found("movie not found"))
    }

    async fn get_json(
        &self,
        path: &str,
        query: &[(&str, &str)],
        force: bool,
    ) -> Result<Value, AppError> {
        let mut url = Url::parse(&format!("{BASE}/{path}")).map_err(AppError::internal)?;
        url.query_pairs_mut().extend_pairs(query);

        let key = url.to_string();
        if !force && let Some(value) = self.cached(&key) {
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

#[derive(Debug, Clone, Serialize)]
pub struct TvEpisode {
    pub episode_number: i32,
    pub name: String,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub runtime: Option<i32>,
    pub still_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TvSeason {
    pub season_number: i32,
    pub name: String,
    pub episodes: Vec<TvEpisode>,
}

impl MovieDetails {
    fn translation(&self) -> jey_core::items::MovieTranslation {
        jey_core::items::MovieTranslation {
            title: self.title.clone(),
            overview: self.overview.clone(),
            tagline: self.tagline.clone(),
            director: self.director.clone(),
            cast: self
                .cast
                .iter()
                .map(|person| jey_core::items::CastMember {
                    tmdb_id: person.tmdb_id,
                    name: person.name.clone(),
                    character: person.character.clone(),
                    profile_path: person.profile_path.clone(),
                })
                .collect(),
            genres: self.genres.clone(),
            countries: self.countries.clone(),
            languages: self.languages.clone(),
            companies: self.companies.clone(),
        }
    }

    /// Converts the API view into the snapshot stored with the record.
    pub fn snapshot(&self) -> jey_core::items::MovieDetails {
        jey_core::items::MovieDetails {
            original_title: self.original_title.clone(),
            overview: self.overview.clone(),
            tagline: self.tagline.clone(),
            runtime: self.runtime,
            release_date: self.release_date.clone(),
            status: self.status.clone(),
            director: self.director.clone(),
            authors: Vec::new(),
            publisher: None,
            page_count: None,
            isbn: None,
            cover_id: None,
            cover_url: None,
            platforms: Vec::new(),
            developers: Vec::new(),
            publishers: Vec::new(),
            anime_format: None,
            anime_season: None,
            cast: self
                .cast
                .iter()
                .map(|person| jey_core::items::CastMember {
                    tmdb_id: person.tmdb_id,
                    name: person.name.clone(),
                    character: person.character.clone(),
                    profile_path: person.profile_path.clone(),
                })
                .collect(),
            genres: self.genres.clone(),
            countries: self.countries.clone(),
            languages: self.languages.clone(),
            companies: self.companies.clone(),
            budget: self.budget,
            revenue: self.revenue,
            imdb_id: self.imdb_id.clone(),
            vote_average_tenths: self.vote_average_tenths,
            vote_count: self.vote_count,
            translations: self.translations.clone(),
            number_of_seasons: self.number_of_seasons,
            number_of_episodes: self.number_of_episodes,
            seasons: self.seasons.clone(),
            watched_episodes: Vec::new(),
        }
    }
}

fn language_key(language: &str) -> String {
    language
        .split(['-', '_'])
        .next()
        .unwrap_or(language)
        .to_ascii_lowercase()
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

fn parse_tv_search_item(value: &Value) -> Option<SearchItem> {
    Some(SearchItem {
        tmdb_id: value.get("id")?.as_u64()?,
        title: value.get("name")?.as_str()?.to_owned(),
        original_title: value
            .get("original_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        year: value
            .get("first_air_date")
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

fn parse_tv_details(value: &Value) -> Option<MovieDetails> {
    let first_air_date = value
        .get("first_air_date")
        .and_then(Value::as_str)
        .filter(|date| !date.is_empty())
        .map(str::to_owned);

    let names = |key: &str| -> Vec<String> {
        value
            .get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.get("name").and_then(Value::as_str))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    };

    let cast = value
        .get("credits")
        .and_then(|credits| credits.get("cast"))
        .and_then(Value::as_array)
        .map(|people| {
            people
                .iter()
                .take(10)
                .filter_map(|person| {
                    Some(CastMember {
                        tmdb_id: person.get("id")?.as_u64()?,
                        name: person.get("name")?.as_str()?.to_owned(),
                        character: person
                            .get("character")
                            .and_then(Value::as_str)
                            .filter(|text| !text.is_empty())
                            .map(str::to_owned),
                        profile_path: person
                            .get("profile_path")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let creator_names: Vec<String> = value
        .get("created_by")
        .and_then(Value::as_array)
        .map(|people| {
            people
                .iter()
                .filter_map(|person| person.get("name").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let seasons = value
        .get("seasons")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|season| {
                    Some(jey_core::items::SeasonSummary {
                        season_number: season.get("season_number")?.as_i64()? as i32,
                        name: season
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        episode_count: season
                            .get("episode_count")
                            .and_then(Value::as_i64)
                            .unwrap_or(0) as i32,
                        air_date: season
                            .get("air_date")
                            .and_then(Value::as_str)
                            .filter(|date| !date.is_empty())
                            .map(str::to_owned),
                        poster_path: season
                            .get("poster_path")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let episode_runtime = value
        .get("episode_run_time")
        .and_then(Value::as_array)
        .and_then(|times| times.first())
        .and_then(Value::as_i64)
        .map(|minutes| minutes as i32);

    let mut companies = names("networks");
    companies.extend(names("production_companies"));

    Some(MovieDetails {
        tmdb_id: value.get("id")?.as_u64()?,
        title: value.get("name")?.as_str()?.to_owned(),
        original_title: value
            .get("original_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        year: first_air_date
            .as_deref()
            .and_then(|date| date.get(..4))
            .and_then(|year| year.parse().ok()),
        overview: value
            .get("overview")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        tagline: value
            .get("tagline")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        runtime: episode_runtime,
        release_date: first_air_date,
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
        poster_path: value
            .get("poster_path")
            .and_then(Value::as_str)
            .map(str::to_owned),
        director: (!creator_names.is_empty()).then(|| creator_names.join(", ")),
        cast,
        genres: names("genres"),
        countries: value
            .get("origin_country")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        languages: names("spoken_languages"),
        companies,
        budget: None,
        revenue: None,
        imdb_id: value
            .get("external_ids")
            .and_then(|ids| ids.get("imdb_id"))
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_owned),
        vote_average_tenths: value
            .get("vote_average")
            .and_then(Value::as_f64)
            .filter(|score| *score > 0.0)
            .map(|score| (score * 10.0).round() as i16),
        vote_count: value
            .get("vote_count")
            .and_then(Value::as_i64)
            .filter(|count| *count > 0),
        translations: BTreeMap::new(),
        number_of_seasons: value
            .get("number_of_seasons")
            .and_then(Value::as_i64)
            .map(|count| count as i32),
        number_of_episodes: value
            .get("number_of_episodes")
            .and_then(Value::as_i64)
            .map(|count| count as i32),
        seasons,
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

    let names = |key: &str| -> Vec<String> {
        value
            .get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.get("name").and_then(Value::as_str))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    };

    let release_date = value
        .get("release_date")
        .and_then(Value::as_str)
        .filter(|date| !date.is_empty())
        .map(str::to_owned);

    Some(MovieDetails {
        tmdb_id: value.get("id")?.as_u64()?,
        title: value.get("title")?.as_str()?.to_owned(),
        original_title: value
            .get("original_title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        year: release_date
            .as_deref()
            .and_then(|date| date.get(..4))
            .and_then(|year| year.parse().ok()),
        overview: value
            .get("overview")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        tagline: value
            .get("tagline")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_owned),
        runtime: value
            .get("runtime")
            .and_then(Value::as_i64)
            .filter(|minutes| *minutes > 0)
            .map(|minutes| minutes as i32),
        release_date,
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
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
                    .filter_map(|person| {
                        Some(CastMember {
                            tmdb_id: person.get("id")?.as_u64()?,
                            name: person.get("name")?.as_str()?.to_owned(),
                            character: person
                                .get("character")
                                .and_then(Value::as_str)
                                .filter(|text| !text.is_empty())
                                .map(str::to_owned),
                            profile_path: person
                                .get("profile_path")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
        genres: names("genres"),
        countries: names("production_countries"),
        languages: names("spoken_languages"),
        companies: names("production_companies"),
        budget: value
            .get("budget")
            .and_then(Value::as_i64)
            .filter(|amount| *amount > 0),
        revenue: value
            .get("revenue")
            .and_then(Value::as_i64)
            .filter(|amount| *amount > 0),
        imdb_id: value
            .get("imdb_id")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .get("external_ids")
                    .and_then(|ids| ids.get("imdb_id"))
                    .and_then(Value::as_str)
            })
            .filter(|id| !id.is_empty())
            .map(str::to_owned),
        vote_average_tenths: value
            .get("vote_average")
            .and_then(Value::as_f64)
            .filter(|score| *score > 0.0)
            .map(|score| (score * 10.0).round() as i16),
        vote_count: value
            .get("vote_count")
            .and_then(Value::as_i64)
            .filter(|count| *count > 0),
        translations: BTreeMap::new(),
        number_of_seasons: None,
        number_of_episodes: None,
        seasons: Vec::new(),
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
                    {
                        "id": 3894,
                        "name": "Патрик Уилсон",
                        "character": "Джош Ламберт",
                        "profile_path": "/wilson.jpg"
                    },
                    { "id": 3895, "name": "Роуз Бирн", "character": "Рене Ламберт" }
                ]
            }
        }))
        .expect("details");

        assert_eq!(movie.director.as_deref(), Some("Джеймс Ван"));
        assert_eq!(movie.cast[0].name, "Патрик Уилсон");
        assert_eq!(movie.cast[0].character.as_deref(), Some("Джош Ламберт"));
        assert_eq!(movie.cast[0].tmdb_id, 3894);
        assert_eq!(movie.genres, vec!["Ужасы"]);
        assert_eq!(movie.runtime, Some(103));
    }

    #[test]
    fn missing_id_is_not_a_movie() {
        assert!(parse_search_item(&json!({ "title": "x" })).is_none());
        assert!(parse_details(&json!({ "title": "x" })).is_none());
    }
}
