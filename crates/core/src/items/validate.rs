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
    let tags = normalise_tags(&item.tags)?;

    Ok(NewItem {
        kind: item.kind,
        title,
        subtitle,
        year: item.year,
        status: item.status,
        rating: item.rating,
        review,
        source_url,
        tags,
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

    let tags = match &patch.tags {
        Some(tags) => Some(normalise_tags(tags)?),
        None => None,
    };

    Ok(ItemPatch {
        kind: patch.kind,
        title,
        subtitle,
        year: patch.year,
        status: patch.status,
        rating: patch.rating,
        review,
        source_url,
        tags,
    })
}

/// Which statuses make sense for each kind of record.
pub fn status_allowed(kind: ItemKind, status: ItemStatus) -> bool {
    match kind {
        // Films and pictures are not "in progress"; noting them is instant.
        ItemKind::Movie | ItemKind::Image => {
            matches!(
                status,
                ItemStatus::Planned | ItemStatus::Done | ItemStatus::Dropped
            )
        }
        ItemKind::Book | ItemKind::Other => true,
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

/// Trims tags, drops empty ones, removes case-insensitive duplicates and
/// enforces the count.
pub fn normalise_tags(tags: &[String]) -> Result<Vec<String>, DomainError> {
    let mut normalised: Vec<String> = Vec::new();

    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().count() > MAX_TAG_LENGTH {
            return Err(DomainError::validation_field(
                "tags",
                format!("each tag must be at most {MAX_TAG_LENGTH} characters"),
            ));
        }

        let duplicate = normalised
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(trimmed));
        if !duplicate {
            normalised.push(trimmed.to_owned());
        }
    }

    if normalised.len() > MAX_TAGS {
        return Err(DomainError::validation_field(
            "tags",
            format!("at most {MAX_TAGS} tags are allowed"),
        ));
    }

    Ok(normalised)
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
            tags: vec![],
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
