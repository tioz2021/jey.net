//! One search contract for web and desktop.
//!
//! Fields: title, localized titles, subtitle, review and metadata details.
//! Ranking: exact title → title starts → title contains → subtitle → review
//! → metadata. Matching is case-insensitive and ignores `ё`/`е` differences.

use crate::items::Item;

/// Normalize a user-visible string for comparisons.
pub fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace('ё', "е")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn contains(haystack: &str, needle: &str) -> bool {
    !needle.is_empty() && normalize(haystack).contains(needle)
}

fn exact(haystack: &str, needle: &str) -> bool {
    !needle.is_empty() && normalize(haystack) == needle
}

/// Relevance score; zero means "not a match".
pub fn score_item(query: &str, item: &Item) -> u32 {
    let needle = normalize(query);
    if needle.is_empty() {
        return 0;
    }

    let mut titles = vec![item.title.as_str()];
    if let Some(details) = &item.details {
        for translation in details.translations.values() {
            if !translation.title.trim().is_empty() {
                titles.push(translation.title.as_str());
            }
        }
    }

    let mut score = 0;
    for title in titles {
        if exact(title, &needle) {
            score = score.max(1000);
        } else if normalize(title).starts_with(&needle) {
            score = score.max(800);
        } else if contains(title, &needle) {
            score = score.max(600);
        }
    }

    if let Some(subtitle) = &item.subtitle {
        if contains(subtitle, &needle) {
            score = score.max(400);
        }
    }
    if let Some(review) = &item.review {
        if contains(review, &needle) {
            score = score.max(300);
        }
    }
    if let Some(details) = &item.details {
        let metadata = metadata_text(details);
        if contains(&metadata, &needle) {
            score = score.max(100);
        }
    }
    score
}

/// Filters and sorts items by the shared relevance rule.
pub fn rank_items(query: &str, items: &[Item]) -> Vec<Item> {
    let mut matched: Vec<(u32, Item)> = items
        .iter()
        .filter_map(|item| {
            let score = score_item(query, item);
            (score > 0).then(|| (score, item.clone()))
        })
        .collect();
    matched.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
            .then_with(|| left.title.cmp(&right.title))
    });
    matched.into_iter().map(|(_, item)| item).collect()
}

fn metadata_text(details: &crate::items::MovieDetails) -> String {
    let mut parts = vec![
        details.original_title.clone(),
        details.overview.clone().unwrap_or_default(),
        details.tagline.clone().unwrap_or_default(),
        details.director.clone().unwrap_or_default(),
    ];
    parts.extend(details.authors.iter().cloned());
    parts.extend(details.genres.iter().cloned());
    parts.extend(details.cast.iter().map(|member| member.name.clone()));
    for translation in details.translations.values() {
        parts.push(translation.title.clone());
        parts.push(translation.overview.clone().unwrap_or_default());
        parts.extend(translation.genres.iter().cloned());
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::items::{ItemKind, ItemStatus, MovieDetails, MovieTranslation};
    use crate::sync::{Revision, SyncSeq, Timestamp};
    use std::collections::BTreeMap;
    use uuid::Uuid;

    fn item(title: &str, subtitle: Option<&str>, translation: Option<&str>) -> Item {
        let mut translations = BTreeMap::new();
        if let Some(title) = translation {
            translations.insert(
                "ru".to_owned(),
                MovieTranslation {
                    title: title.to_owned(),
                    overview: None,
                    tagline: None,
                    director: None,
                    cast: vec![],
                    genres: vec![],
                    countries: vec![],
                    languages: vec![],
                    companies: vec![],
                },
            );
        }
        Item {
            id: Uuid::new_v4(),
            slug: title.to_owned(),
            user_id: Uuid::new_v4(),
            kind: ItemKind::Movie,
            title: title.to_owned(),
            subtitle: subtitle.map(str::to_owned),
            year: None,
            status: ItemStatus::Done,
            rating: None,
            review: None,
            body: None,
            source_url: None,
            cover_key: None,
            external_source: None,
            external_id: None,
            details: Some(MovieDetails {
                translations,
                ..MovieDetails::default()
            }),
            details_fetched_at: None,
            public_hidden: false,
            revision: Revision::INITIAL,
            sync_seq: SyncSeq::ZERO,
            device_id: None,
            created_at: Timestamp::EPOCH,
            updated_at: Timestamp::EPOCH,
            deleted_at: None,
        }
    }

    #[test]
    fn finds_a_localized_title() {
        let item = item("Troy", Some("Wolfgang Petersen"), Some("Троя"));
        assert_eq!(score_item("Троя", &item), 1000);
        assert_eq!(score_item("троя", &item), 1000);
        assert_eq!(score_item("Troy", &item), 1000);
    }

    #[test]
    fn ranks_title_above_subtitle_and_metadata() {
        let title = item("Троя", None, None);
        let subtitle = item("Movie", Some("Троя"), None);
        let items = vec![subtitle, title];
        let ranked = rank_items("Троя", &items);
        assert_eq!(ranked[0].title, "Троя");
        assert_eq!(ranked[1].title, "Movie");
    }
}
