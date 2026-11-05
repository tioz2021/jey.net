//! JSON shape of an item, independent of how it is stored.

use chrono::{DateTime, Utc};
use jey_core::items::{Item, ItemKind, ItemStatus, MovieDetails};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct ItemView {
    pub id: Uuid,
    pub slug: String,
    pub kind: ItemKind,
    pub title: String,
    pub subtitle: Option<String>,
    pub year: Option<i32>,
    pub status: ItemStatus,
    pub rating: Option<u8>,
    pub review: Option<String>,
    pub body: Option<String>,
    pub source_url: Option<String>,
    pub cover_key: Option<String>,
    pub public_hidden: bool,
    pub external_source: Option<String>,
    pub external_id: Option<String>,
    pub details: Option<MovieDetails>,
    pub details_fetched_at: Option<DateTime<Utc>>,
    pub revision: u64,
    pub sync_seq: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl From<Item> for ItemView {
    fn from(item: Item) -> Self {
        Self {
            id: item.id,
            slug: item.slug,
            kind: item.kind,
            title: item.title,
            subtitle: item.subtitle,
            year: item.year,
            status: item.status,
            rating: item.rating,
            review: item.review,
            body: item.body,
            source_url: item.source_url,
            cover_key: item.cover_key,
            public_hidden: item.public_hidden,
            external_source: item.external_source,
            external_id: item.external_id,
            details: item.details,
            details_fetched_at: item.details_fetched_at.map(to_datetime),
            revision: item.revision.get(),
            sync_seq: item.sync_seq.get(),
            created_at: to_datetime(item.created_at),
            updated_at: to_datetime(item.updated_at),
            deleted_at: item.deleted_at.map(to_datetime),
        }
    }
}

fn to_datetime(value: jey_core::sync::Timestamp) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(value.as_millis()).unwrap_or_default()
}
