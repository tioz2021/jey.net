//! Item types shared by the API server and the desktop client.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::DomainError;
use crate::sync::{DeviceId, Revision, SyncSeq, Timestamp};

/// What kind of record this is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Movie,
    Book,
    Image,
    Other,
}

impl ItemKind {
    pub const ALL: [Self; 4] = [Self::Movie, Self::Book, Self::Image, Self::Other];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Book => "book",
            Self::Image => "image",
            Self::Other => "other",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, DomainError> {
        match raw {
            "movie" => Ok(Self::Movie),
            "book" => Ok(Self::Book),
            "image" => Ok(Self::Image),
            "other" => Ok(Self::Other),
            other => Err(DomainError::validation_field(
                "kind",
                format!("kind must be one of: movie, book, image, other; got {other:?}"),
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

/// A stored record, as the API returns it and the desktop keeps it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    pub user_id: Uuid,
    pub kind: ItemKind,
    pub title: String,
    pub subtitle: Option<String>,
    pub year: Option<i32>,
    pub status: ItemStatus,
    pub rating: Option<u8>,
    pub review: Option<String>,
    pub source_url: Option<String>,
    pub cover_key: Option<String>,
    pub tags: Vec<String>,
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
    pub source_url: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
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
    pub source_url: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
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
            && self.source_url.is_none()
            && self.tags.is_none()
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
        assert!(ItemKind::parse("game").is_err());
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
