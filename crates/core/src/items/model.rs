//! Item types shared by the API server and the desktop client.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::DomainError;
use crate::sync::{DeviceId, Revision, SyncSeq, Timestamp};

/// What kind of record this is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Movie,
    Tv,
    Book,
    Game,
    Anime,
    Image,
    Other,
}

impl ItemKind {
    pub const ALL: [Self; 7] = [
        Self::Movie,
        Self::Tv,
        Self::Book,
        Self::Game,
        Self::Anime,
        Self::Image,
        Self::Other,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Tv => "tv",
            Self::Book => "book",
            Self::Game => "game",
            Self::Anime => "anime",
            Self::Image => "image",
            Self::Other => "other",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, DomainError> {
        match raw {
            "movie" => Ok(Self::Movie),
            "tv" => Ok(Self::Tv),
            "book" => Ok(Self::Book),
            "game" => Ok(Self::Game),
            "anime" => Ok(Self::Anime),
            "image" => Ok(Self::Image),
            "other" => Ok(Self::Other),
            other => Err(DomainError::validation_field(
                "kind",
                format!(
                    "kind must be one of: movie, tv, book, game, anime, image, other; got {other:?}"
                ),
            )),
        }
    }
}

/// Where the record stands in the person's own workflow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Planned,
    InProgress,
    Done,
    Dropped,
}

impl ItemStatus {
    pub const ALL: [Self; 4] = [Self::Planned, Self::InProgress, Self::Done, Self::Dropped];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Planned => "planned",
            Self::InProgress => "in_progress",
            Self::Done => "done",
            Self::Dropped => "dropped",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, DomainError> {
        match raw {
            "planned" => Ok(Self::Planned),
            "in_progress" => Ok(Self::InProgress),
            "done" => Ok(Self::Done),
            "dropped" => Ok(Self::Dropped),
            other => Err(DomainError::validation_field(
                "status",
                format!(
                    "status must be one of: planned, in_progress, done, dropped; got {other:?}"
                ),
            )),
        }
    }
}

/// One actor in the stored credits. TMDB ids allow linking to a person page;
/// profile images are never stored, only the path for an online request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CastMember {
    #[serde(default)]
    pub tmdb_id: u64,
    pub name: String,
    #[serde(default)]
    pub character: Option<String>,
    #[serde(default)]
    pub profile_path: Option<String>,
}

/// One localized version of the text fields. Shared facts (budget, runtime,
/// release date, IMDb id, rating) live outside the translations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct MovieTranslation {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub tagline: Option<String>,
    #[serde(default)]
    pub director: Option<String>,
    #[serde(default, deserialize_with = "deserialize_cast")]
    pub cast: Vec<CastMember>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub countries: Vec<String>,
    #[serde(default)]
    pub languages: Vec<String>,
    #[serde(default)]
    pub companies: Vec<String>,
}

/// One watched episode of a TV show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WatchedEpisode {
    #[serde(default)]
    pub season_number: i32,
    #[serde(default)]
    pub episode_number: i32,
}

/// One season of a TV show; episodes are loaded on demand from TMDB.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeasonSummary {
    #[serde(default)]
    pub season_number: i32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub episode_count: i32,
    #[serde(default)]
    pub air_date: Option<String>,
    #[serde(default)]
    pub poster_path: Option<String>,
}

/// Snapshot of the movie metadata we keep with a record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MovieDetails {
    #[serde(default)]
    pub original_title: String,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub tagline: Option<String>,
    #[serde(default)]
    pub runtime: Option<i32>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub director: Option<String>,
    /// Book authors; empty for films and series.
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub page_count: Option<i32>,
    #[serde(default)]
    pub isbn: Option<String>,
    /// Open Library cover id, used to download the cover.
    #[serde(default)]
    pub cover_id: Option<i64>,
    /// Provider cover URL, used to download the cover.
    #[serde(default)]
    pub cover_url: Option<String>,
    /// IGDB platforms, developers and publishers; empty for other kinds.
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub developers: Vec<String>,
    #[serde(default)]
    pub publishers: Vec<String>,
    /// Anime format and season, empty for other kinds.
    #[serde(default)]
    pub anime_format: Option<String>,
    #[serde(default)]
    pub anime_season: Option<String>,
    #[serde(default, deserialize_with = "deserialize_cast")]
    pub cast: Vec<CastMember>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub countries: Vec<String>,
    #[serde(default)]
    pub languages: Vec<String>,
    #[serde(default)]
    pub companies: Vec<String>,
    #[serde(default)]
    pub budget: Option<i64>,
    #[serde(default)]
    pub revenue: Option<i64>,
    #[serde(default)]
    pub imdb_id: Option<String>,
    /// TMDB rating multiplied by ten, so the struct stays `Eq`.
    #[serde(default)]
    pub vote_average_tenths: Option<i16>,
    #[serde(default)]
    pub vote_count: Option<i64>,
    /// Localized variants keyed by `ru`, `uk`, `en`.
    #[serde(default)]
    pub translations: BTreeMap<String, MovieTranslation>,
    #[serde(default)]
    pub number_of_seasons: Option<i32>,
    #[serde(default)]
    pub number_of_episodes: Option<i32>,
    #[serde(default)]
    pub seasons: Vec<SeasonSummary>,
    #[serde(default)]
    pub watched_episodes: Vec<WatchedEpisode>,
    #[serde(default)]
    pub progress: Option<Progress>,
}

/// Manual progress for kinds that are consumed over time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Progress {
    #[serde(default)]
    pub current: i32,
    #[serde(default)]
    pub total: Option<i32>,
    #[serde(default)]
    pub unit: String,
}

/// Old snapshots stored cast as plain strings; accept both shapes.
#[derive(Deserialize)]
#[serde(untagged)]
enum CastEntry {
    Name(String),
    Member(CastMember),
}

fn deserialize_cast<'de, D>(deserializer: D) -> Result<Vec<CastMember>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let entries = Vec::<CastEntry>::deserialize(deserializer)?;

    Ok(entries
        .into_iter()
        .map(|entry| match entry {
            CastEntry::Name(name) => CastMember {
                tmdb_id: 0,
                name,
                character: None,
                profile_path: None,
            },
            CastEntry::Member(member) => member,
        })
        .collect())
}

/// A stored record, as the API returns it and the desktop keeps it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    #[serde(default)]
    pub slug: String,
    pub user_id: Uuid,
    pub kind: ItemKind,
    pub title: String,
    pub subtitle: Option<String>,
    pub year: Option<i32>,
    pub status: ItemStatus,
    pub rating: Option<u8>,
    pub review: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    pub source_url: Option<String>,
    pub cover_key: Option<String>,
    #[serde(default)]
    pub external_source: Option<String>,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub details: Option<MovieDetails>,
    #[serde(default)]
    pub details_fetched_at: Option<Timestamp>,
    #[serde(default)]
    pub public_hidden: bool,
    pub revision: Revision,
    pub sync_seq: SyncSeq,
    pub device_id: Option<DeviceId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

/// Fields needed to create a record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewItem {
    pub kind: ItemKind,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    pub status: ItemStatus,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub review: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub external_source: Option<String>,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub details: Option<MovieDetails>,
    #[serde(default)]
    pub public_hidden: bool,
}

/// Partial update: absent fields stay untouched.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemPatch {
    #[serde(default)]
    pub kind: Option<ItemKind>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub status: Option<ItemStatus>,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub review: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub external_source: Option<String>,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub details: Option<MovieDetails>,
    #[serde(default)]
    pub public_hidden: Option<bool>,
}

impl ItemPatch {
    /// True when the patch would not change anything.
    pub fn is_empty(&self) -> bool {
        self.kind.is_none()
            && self.title.is_none()
            && self.subtitle.is_none()
            && self.year.is_none()
            && self.status.is_none()
            && self.rating.is_none()
            && self.review.is_none()
            && self.body.is_none()
            && self.source_url.is_none()
            && self.external_source.is_none()
            && self.external_id.is_none()
            && self.details.is_none()
            && self.public_hidden.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip() {
        for kind in ItemKind::ALL {
            assert_eq!(ItemKind::parse(kind.as_str()).expect("parses"), kind);
        }
    }

    #[test]
    fn statuses_round_trip() {
        for status in ItemStatus::ALL {
            assert_eq!(ItemStatus::parse(status.as_str()).expect("parses"), status);
        }
    }

    #[test]
    fn unknown_values_are_rejected() {
        assert_eq!(ItemKind::parse("game").expect("game"), ItemKind::Game);
        assert!(ItemKind::parse("").is_err());
        assert!(ItemStatus::parse("lost").is_err());
    }

    #[test]
    fn empty_patch_is_detected() {
        assert!(ItemPatch::default().is_empty());
        assert!(
            !ItemPatch {
                title: Some("Interstellar".to_owned()),
                ..ItemPatch::default()
            }
            .is_empty()
        );
    }
}
