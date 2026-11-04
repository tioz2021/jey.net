//! Validation rules for items, shared by the server and the desktop client.
//!
//! The database enforces the same limits, but a friendly error with a field
//! name is produced here, before a row is written.

use super::model::{ItemKind, ItemPatch, ItemStatus, NewItem};
use crate::error::DomainError;

pub const MAX_TITLE_LENGTH: usize = 300;
pub const MAX_SUBTITLE_LENGTH: usize = 300;
pub const MAX_REVIEW_LENGTH: usize = 20_000;
pub const MAX_URL_LENGTH: usize = 2048;
pub const MAX_TAG_LENGTH: usize = 40;
pub const MAX_TAGS: usize = 20;
pub const MIN_YEAR: i32 = 1800;
pub const MAX_YEAR: i32 = 2100;
pub const MIN_RATING: u8 = 1;
pub const MAX_RATING: u8 = 10;

/// Checks a new item and returns a normalised copy.
pub fn validate_new(item: &NewItem) -> Result<NewItem, DomainError> {
    let title = clean_title(&item.title)?;
    let subtitle = match item.subtitle.as_deref() {
        Some(value) => Some(clean_optional_text(
            "subtitle",
            value,
            MAX_SUBTITLE_LENGTH,
            false,
        )?),
        None => None,
    };
    let review = match item.review.as_deref() {
        Some(value) => Some(clean_optional_text(
            "review",
            value,
            MAX_REVIEW_LENGTH,
            true,
        )?),
        None => None,
    };
    let source_url = match item.source_url.as_deref() {
        Some(value) => Some(clean_url(value)?),
        None => None,
    };

    validate_year(item.year)?;
    validate_rating(item.rating)?;
    let (external_source, external_id) =
        clean_external(item.external_source.as_deref(), item.external_id.as_deref())?;
    let details = clean_details(item.details.as_ref())?;

    Ok(NewItem {
        kind: item.kind,
        title,
        subtitle,
        year: item.year,
        status: item.status,
        rating: item.rating,
        review,
        source_url,
        external_source,
        external_id,
        details,
        public_hidden: item.public_hidden,
    })
}

/// Checks a patch: only the fields that are present get validated.
pub fn validate_patch(patch: &ItemPatch) -> Result<ItemPatch, DomainError> {
    let title = match patch.title.as_deref() {
        Some(value) => Some(clean_title(value)?),
        None => None,
    };
    let subtitle = match patch.subtitle.as_deref() {
        Some(value) => Some(clean_optional_text(
            "subtitle",
            value,
            MAX_SUBTITLE_LENGTH,
            false,
        )?),
        None => None,
    };
    let review = match patch.review.as_deref() {
        Some(value) => Some(clean_optional_text(
            "review",
            value,
            MAX_REVIEW_LENGTH,
            true,
        )?),
        None => None,
    };
    let source_url = match patch.source_url.as_deref() {
        Some(value) => Some(clean_url(value)?),
        None => None,
    };

    validate_year(patch.year)?;
    validate_rating(patch.rating)?;

    let (external_source, external_id) = clean_external(
        patch.external_source.as_deref(),
        patch.external_id.as_deref(),
    )?;
    let details = clean_details(patch.details.as_ref())?;

    Ok(ItemPatch {
        kind: patch.kind,
        title,
        subtitle,
        year: patch.year,
        status: patch.status,
        rating: patch.rating,
        review,
        source_url,
        external_source,
        external_id,
        details,
        public_hidden: patch.public_hidden,
    })
}

fn clean_external(
    source: Option<&str>,
    id: Option<&str>,
) -> Result<(Option<String>, Option<String>), DomainError> {
    let source = source.map(str::trim).filter(|value| !value.is_empty());
    let id = id.map(str::trim).filter(|value| !value.is_empty());

    if source.is_some() != id.is_some() {
        return Err(DomainError::validation_field(
            "external_id",
            "external source and id must be provided together",
        ));
    }

    let Some(source) = source else {
        return Ok((None, None));
    };
    let id = id.expect("checked together");

    if source.chars().count() > 32
        || !source
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err(DomainError::validation_field(
            "external_source",
            "external source must be a short identifier",
        ));
    }
    if id.chars().count() > 64 {
        return Err(DomainError::validation_field(
            "external_id",
            "external id must be at most 64 characters",
        ));
    }

    Ok((Some(source.to_ascii_lowercase()), Some(id.to_owned())))
}

fn clean_cover_url(value: Option<&str>) -> Result<Option<String>, DomainError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > 2048
        || !(value.starts_with("https://books.google.com/")
            || value.starts_with("https://books.googleusercontent.com/")
            || value.starts_with("https://images.igdb.com/")
            || value.starts_with("https://s4.anilist.co/")
            || value.starts_with("https://shikimori.one/")
            || value.starts_with("https://shikimori.me/"))
    {
        return Err(DomainError::validation_field(
            "details.cover_url",
            "cover URL must point to a supported metadata provider",
        ));
    }
    Ok(Some(value.to_owned()))
}

fn clean_details(
    details: Option<&crate::items::MovieDetails>,
) -> Result<Option<crate::items::MovieDetails>, DomainError> {
    let Some(details) = details else {
        return Ok(None);
    };

    let overview = details
        .overview
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if overview.is_some_and(|value| value.chars().count() > 5000) {
        return Err(DomainError::validation_field(
            "details.overview",
            "overview must be at most 5000 characters",
        ));
    }

    let director = details
        .director
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if director.is_some_and(|value| value.chars().count() > 200) {
        return Err(DomainError::validation_field(
            "details.director",
            "director must be at most 200 characters",
        ));
    }

    if details.cast.len() > 50 || details.genres.len() > 20 {
        return Err(DomainError::validation_field(
            "details",
            "too many cast or genre entries",
        ));
    }

    let clean_list = |values: &[String], limit: usize| -> Result<Vec<String>, DomainError> {
        values
            .iter()
            .map(|value| {
                let value = value.trim();
                if value.is_empty() || value.chars().count() > limit {
                    Err(DomainError::validation_field(
                        "details",
                        "cast and genre entries must be short non-empty strings",
                    ))
                } else {
                    Ok(value.to_owned())
                }
            })
            .collect()
    };

    let clean_cast = |people: &[crate::items::CastMember]| -> Result<Vec<crate::items::CastMember>, DomainError> {
        people
            .iter()
            .map(|person| {
                let name = person.name.trim();
                if name.is_empty() || name.chars().count() > 200 {
                    return Err(DomainError::validation_field(
                        "details.cast",
                        "cast names must be short non-empty strings",
                    ));
                }
                if person
                    .character
                    .as_deref()
                    .is_some_and(|value| value.chars().count() > 200)
                {
                    return Err(DomainError::validation_field(
                        "details.cast",
                        "character names must be short",
                    ));
                }
                if person
                    .profile_path
                    .as_deref()
                    .is_some_and(|value| !value.starts_with('/') || value.len() > 200)
                {
                    return Err(DomainError::validation_field(
                        "details.cast",
                        "profile paths must be relative TMDB paths",
                    ));
                }

                Ok(crate::items::CastMember {
                    tmdb_id: person.tmdb_id,
                    name: name.to_owned(),
                    character: person
                        .character
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned),
                    profile_path: person
                        .profile_path
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned),
                })
            })
            .collect()
    };

    let cast = clean_cast(&details.cast)?;

    let mut translations = std::collections::BTreeMap::new();

    for (key, translation) in &details.translations {
        if !matches!(key.as_str(), "ru" | "uk" | "en") {
            continue;
        }
        if translation.cast.len() > 50 || translation.genres.len() > 20 {
            return Err(DomainError::validation_field(
                "details.translations",
                "too many cast or genre entries in a translation",
            ));
        }
        if translation
            .overview
            .as_deref()
            .is_some_and(|value| value.chars().count() > 5000)
        {
            return Err(DomainError::validation_field(
                "details.translations",
                "translated overview is too long",
            ));
        }

        translations.insert(
            key.clone(),
            crate::items::MovieTranslation {
                title: translation.title.trim().chars().take(300).collect(),
                overview: translation
                    .overview
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                tagline: translation
                    .tagline
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.chars().take(500).collect()),
                director: translation
                    .director
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.chars().take(200).collect()),
                cast: clean_cast(&translation.cast)?,
                genres: clean_list(&translation.genres, 100)?,
                countries: clean_list(&translation.countries, 100)?,
                languages: clean_list(&translation.languages, 100)?,
                companies: clean_list(&translation.companies, 200)?,
            },
        );
    }

    Ok(Some(crate::items::MovieDetails {
        original_title: details.original_title.trim().chars().take(300).collect(),
        overview: overview.map(str::to_owned),
        tagline: details
            .tagline
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(500).collect()),
        runtime: details
            .runtime
            .filter(|minutes| (1..=1000).contains(minutes)),
        release_date: details
            .release_date
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
        status: details
            .status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
        director: director.map(str::to_owned),
        authors: clean_list(&details.authors, 20)?,
        publisher: details
            .publisher
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(300).collect()),
        page_count: details
            .page_count
            .filter(|pages| (1..=100_000).contains(pages)),
        isbn: details
            .isbn
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(32).collect()),
        cover_id: details.cover_id.filter(|id| *id > 0),
        cover_url: clean_cover_url(details.cover_url.as_deref())?,
        platforms: clean_list(&details.platforms, 60)?,
        developers: clean_list(&details.developers, 100)?,
        publishers: clean_list(&details.publishers, 100)?,
        anime_format: details
            .anime_format
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(40).collect()),
        anime_season: details
            .anime_season
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(40).collect()),
        cast,
        genres: clean_list(&details.genres, 100)?,
        countries: clean_list(&details.countries, 100)?,
        languages: clean_list(&details.languages, 100)?,
        companies: clean_list(&details.companies, 200)?,
        budget: details.budget.filter(|value| *value > 0),
        revenue: details.revenue.filter(|value| *value > 0),
        imdb_id: details
            .imdb_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(32).collect()),
        vote_average_tenths: details
            .vote_average_tenths
            .filter(|value| (0..=100).contains(value)),
        vote_count: details.vote_count.filter(|value| *value >= 0),
        translations,
        watched_episodes: {
            let mut seen = std::collections::BTreeSet::new();
            let mut watched = Vec::new();
            for episode in details.watched_episodes.iter().take(10_000) {
                if episode.season_number < 0
                    || episode.season_number > 100
                    || episode.episode_number < 1
                    || episode.episode_number > 10_000
                {
                    return Err(DomainError::validation_field(
                        "details.watched_episodes",
                        "watched episodes must have valid season and episode numbers",
                    ));
                }
                if seen.insert((episode.season_number, episode.episode_number)) {
                    watched.push(crate::items::WatchedEpisode {
                        season_number: episode.season_number,
                        episode_number: episode.episode_number,
                    });
                }
            }
            watched
        },
        number_of_seasons: details
            .number_of_seasons
            .filter(|value| (0..=100).contains(value)),
        number_of_episodes: details
            .number_of_episodes
            .filter(|value| (0..=10_000).contains(value)),
        seasons: details
            .seasons
            .iter()
            .take(100)
            .map(|season| crate::items::SeasonSummary {
                season_number: season.season_number,
                name: season.name.trim().chars().take(200).collect(),
                episode_count: season.episode_count.clamp(0, 10_000),
                air_date: season
                    .air_date
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                poster_path: season
                    .poster_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
            })
            .collect(),
    }))
}

/// Which statuses make sense for each kind of record.
pub fn status_allowed(kind: ItemKind, status: ItemStatus) -> bool {
    match kind {
        // Films and pictures are not "in progress"; series and books are.
        ItemKind::Movie | ItemKind::Image => {
            matches!(
                status,
                ItemStatus::Planned | ItemStatus::Done | ItemStatus::Dropped
            )
        }
        ItemKind::Tv | ItemKind::Book | ItemKind::Game | ItemKind::Anime | ItemKind::Other => true,
    }
}

fn clean_title(value: &str) -> Result<String, DomainError> {
    let cleaned = sanitise(value, false);
    let trimmed = cleaned.trim();
    let length = trimmed.chars().count();

    if length == 0 {
        return Err(DomainError::validation_field("title", "title is required"));
    }
    if length > MAX_TITLE_LENGTH {
        return Err(DomainError::validation_field(
            "title",
            format!("title must be at most {MAX_TITLE_LENGTH} characters"),
        ));
    }

    Ok(trimmed.to_owned())
}

fn clean_optional_text(
    field: &'static str,
    value: &str,
    max_length: usize,
    keep_line_breaks: bool,
) -> Result<String, DomainError> {
    let cleaned = sanitise(value, keep_line_breaks);
    let trimmed = cleaned.trim();
    let length = trimmed.chars().count();

    if length > max_length {
        return Err(DomainError::validation_field(
            field,
            format!("{field} must be at most {max_length} characters"),
        ));
    }

    Ok(trimmed.to_owned())
}

fn clean_url(value: &str) -> Result<String, DomainError> {
    let cleaned = sanitise(value, false);
    let trimmed = cleaned.trim();

    if trimmed.chars().count() > MAX_URL_LENGTH {
        return Err(DomainError::validation_field(
            "source_url",
            format!("source_url must be at most {MAX_URL_LENGTH} characters"),
        ));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(DomainError::validation_field(
            "source_url",
            "source_url must start with http:// or https://",
        ));
    }

    Ok(trimmed.to_owned())
}

fn validate_year(year: Option<i32>) -> Result<(), DomainError> {
    match year {
        Some(year) if !(MIN_YEAR..=MAX_YEAR).contains(&year) => Err(DomainError::validation_field(
            "year",
            format!("year must be between {MIN_YEAR} and {MAX_YEAR}"),
        )),
        _ => Ok(()),
    }
}

fn validate_rating(rating: Option<u8>) -> Result<(), DomainError> {
    match rating {
        Some(rating) if !(MIN_RATING..=MAX_RATING).contains(&rating) => {
            Err(DomainError::validation_field(
                "rating",
                format!("rating must be between {MIN_RATING} and {MAX_RATING}"),
            ))
        }
        _ => Ok(()),
    }
}

/// Removes control characters: they break rendering, logs and terminals.
///
/// Reviews keep line breaks and tabs; titles and URLs lose them too.
fn sanitise(value: &str, keep_line_breaks: bool) -> String {
    value
        .chars()
        .filter(|ch| {
            if keep_line_breaks && matches!(ch, '\n' | '\t') {
                return true;
            }
            !ch.is_control()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_item() -> NewItem {
        NewItem {
            kind: ItemKind::Movie,
            title: "Interstellar".to_owned(),
            subtitle: None,
            year: Some(2014),
            status: ItemStatus::Done,
            rating: Some(9),
            review: None,
            source_url: None,
            external_source: None,
            external_id: None,
            details: None,
        }
    }

    #[test]
    fn valid_item_passes_and_is_trimmed() {
        let mut item = new_item();
        item.title = "  Interstellar  ".to_owned();
        item.subtitle = Some("  Christopher Nolan ".to_owned());

        let validated = validate_new(&item).expect("valid");

        assert_eq!(validated.title, "Interstellar");
        assert_eq!(validated.subtitle.as_deref(), Some("Christopher Nolan"));
    }

    #[test]
    fn empty_title_is_rejected() {
        let mut item = new_item();
        item.title = "   ".to_owned();

        let error = validate_new(&item).expect_err("empty title");
        assert!(error.to_string().contains("title is required"));
    }

    #[test]
    fn rating_and_year_are_bounded() {
        let mut item = new_item();
        item.rating = Some(0);
        assert!(validate_new(&item).is_err());

        item.rating = Some(11);
        assert!(validate_new(&item).is_err());

        item.rating = Some(10);
        item.year = Some(1500);
        assert!(validate_new(&item).is_err());

        item.year = Some(1800);
        assert!(validate_new(&item).is_ok());
    }

    #[test]
    fn too_many_tags_are_rejected() {
        let mut item = new_item();
        item.tags = (0..21).map(|index| format!("tag-{index}")).collect();

        let error = validate_new(&item).expect_err("too many tags");
        assert!(error.to_string().contains("at most 20"));
    }

    #[test]
    fn tags_are_trimmed_and_deduplicated() {
        let tags = vec![
            "  sci-fi ".to_owned(),
            "SCI-FI".to_owned(),
            String::new(),
            "nolan".to_owned(),
        ];

        let normalised = normalise_tags(&tags).expect("valid tags");
        assert_eq!(normalised, vec!["sci-fi".to_owned(), "nolan".to_owned()]);
    }

    #[test]
    fn urls_must_be_http() {
        let mut item = new_item();
        item.source_url = Some("ftp://example.com/file".to_owned());
        assert!(validate_new(&item).is_err());

        item.source_url = Some("https://example.com".to_owned());
        assert!(validate_new(&item).is_ok());
    }

    #[test]
    fn control_characters_are_removed() {
        let mut item = new_item();
        item.title = "Inter\u{0007}stellar".to_owned();
        item.review = Some("line one\nline two\ttabbed\u{001b}[31m".to_owned());

        let validated = validate_new(&item).expect("valid");

        assert_eq!(validated.title, "Interstellar");
        assert_eq!(
            validated.review.as_deref(),
            Some("line one\nline two\ttabbed[31m")
        );
    }

    #[test]
    fn titles_lose_line_breaks() {
        let mut item = new_item();
        item.title = "Inter\nstellar".to_owned();

        assert_eq!(validate_new(&item).expect("valid").title, "Interstellar");
    }

    #[test]
    fn review_length_is_bounded() {
        let mut item = new_item();

        item.review = Some("a".repeat(MAX_REVIEW_LENGTH));
        assert!(validate_new(&item).is_ok());

        item.review = Some("a".repeat(MAX_REVIEW_LENGTH + 1));
        assert!(validate_new(&item).is_err());
    }

    #[test]
    fn statuses_depend_on_kind() {
        assert!(!status_allowed(ItemKind::Movie, ItemStatus::InProgress));
        assert!(status_allowed(ItemKind::Book, ItemStatus::InProgress));
        assert!(status_allowed(ItemKind::Movie, ItemStatus::Done));
    }
}
