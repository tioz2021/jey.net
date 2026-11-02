//! Cursor-based pagination for the item list.
//!
//! Offsets break as soon as a record is added or removed between pages, so the
//! cursor carries the sort value and id of the last row and the next page asks
//! for rows strictly beyond it.

use axum::Json;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use jey_core::items::{Item, ItemKind, ItemStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub kind: Option<String>,
    pub status: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub cursor: Option<String>,
}

/// `GET /api/v1/items`
pub async fn list_items(
    State(state): State<AppState>,
    current: CurrentUser,
    query: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Json<Value>, AppError> {
    let Query(query) = query.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let kind = parse_kind(query.kind.as_deref())?;
    let status = parse_status(query.status.as_deref())?;
    let sort = match query.sort.as_deref() {
        Some(raw) => Sort::parse(raw)?,
        None => Sort::CreatedDesc,
    };
    let limit = parse_limit(query.limit)?;
    let cursor = match query.cursor.as_deref() {
        Some(raw) => Some(decode_cursor(raw)?),
        None => None,
    };

    // One extra row tells us whether another page exists.
    let mut items = repo::list_page(
        &state.pool,
        current.user.id,
        kind,
        status,
        sort,
        limit + 1,
        cursor,
    )
    .await?;

    let has_more = items.len() as i64 > limit;
    if has_more {
        items.truncate(limit as usize);
    }

    let next_cursor = if has_more {
        items.last().map(|item| encode_cursor(sort, item))
    } else {
        None
    };

    let views: Vec<ItemView> = items.into_iter().map(ItemView::from).collect();

    Ok(Json(json!({ "items": views, "next_cursor": next_cursor })))
}

pub const DEFAULT_LIMIT: i64 = 20;
pub const MAX_LIMIT: i64 = 100;

/// Sort orders the API accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sort {
    CreatedDesc,
    CreatedAsc,
    UpdatedDesc,
    RatingDesc,
    TitleAsc,
    YearDesc,
}

impl Sort {
    pub fn parse(raw: &str) -> Result<Self, AppError> {
        match raw {
            "created_desc" => Ok(Self::CreatedDesc),
            "created_asc" => Ok(Self::CreatedAsc),
            "updated_desc" => Ok(Self::UpdatedDesc),
            "rating_desc" => Ok(Self::RatingDesc),
            "title_asc" => Ok(Self::TitleAsc),
            "year_desc" => Ok(Self::YearDesc),
            other => Err(AppError::validation_field(
                "sort",
                format!(
                    "sort must be one of: created_desc, created_asc, updated_desc, \
                     rating_desc, title_asc, year_desc; got {other:?}"
                ),
            )),
        }
    }
}

/// What a cursor points at: the sort value and the id of the last row.
#[derive(Debug, Serialize, Deserialize)]
struct CursorPayload {
    value: String,
    id: Uuid,
}

/// Builds the cursor for the last item of a page.
pub fn encode_cursor(sort: Sort, item: &Item) -> String {
    let value = sort_value(sort, item);
    let payload = CursorPayload { value, id: item.id };

    URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).expect("cursor payload serialises"))
}

/// Decodes a cursor into the sort value and the id.
pub fn decode_cursor(raw: &str) -> Result<(String, Uuid), AppError> {
    let invalid = || AppError::validation_field("cursor", "cursor is invalid");

    let bytes = URL_SAFE_NO_PAD.decode(raw).map_err(|_| invalid())?;
    let payload: CursorPayload = serde_json::from_slice(&bytes).map_err(|_| invalid())?;

    if payload.value.is_empty() {
        return Err(invalid());
    }

    Ok((payload.value, payload.id))
}

/// Canonical text form of the value this sort orders by.
fn sort_value(sort: Sort, item: &Item) -> String {
    match sort {
        Sort::CreatedDesc | Sort::CreatedAsc => item.created_at.as_millis().to_string(),
        Sort::UpdatedDesc => item.updated_at.as_millis().to_string(),
        Sort::RatingDesc => item.rating.unwrap_or(0).to_string(),
        Sort::YearDesc => item.year.unwrap_or(0).to_string(),
        Sort::TitleAsc => item.title.to_lowercase(),
    }
}

/// Parses `limit` with the API bounds.
pub fn parse_limit(raw: Option<i64>) -> Result<i64, AppError> {
    let limit = raw.unwrap_or(DEFAULT_LIMIT);

    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::validation_field(
            "limit",
            format!("limit must be between 1 and {MAX_LIMIT}"),
        ));
    }

    Ok(limit)
}

/// Parses optional filters.
pub fn parse_kind(raw: Option<&str>) -> Result<Option<ItemKind>, AppError> {
    Ok(raw.map(ItemKind::parse).transpose()?)
}

pub fn parse_status(raw: Option<&str>) -> Result<Option<ItemStatus>, AppError> {
    Ok(raw.map(ItemStatus::parse).transpose()?)
}

#[cfg(test)]
mod tests {
    use jey_core::items::ItemKind;
    use jey_core::sync::{Revision, SyncSeq, Timestamp};

    use super::*;

    fn item(title: &str, rating: Option<u8>) -> Item {
        Item {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: ItemKind::Movie,
            title: title.to_owned(),
            subtitle: None,
            year: Some(2014),
            status: jey_core::items::ItemStatus::Done,
            rating,
            review: None,
            source_url: None,
            cover_key: None,
            tags: vec![],
            revision: Revision::INITIAL,
            sync_seq: SyncSeq::ZERO,
            device_id: None,
            created_at: Timestamp::from_millis(1_700_000_000_000),
            updated_at: Timestamp::from_millis(1_700_000_000_000),
            deleted_at: None,
        }
    }

    #[test]
    fn cursor_round_trip() {
        let item = item("Interstellar", Some(9));
        let encoded = encode_cursor(Sort::RatingDesc, &item);

        let (value, id) = decode_cursor(&encoded).expect("decodes");
        assert_eq!(value, "9");
        assert_eq!(id, item.id);
    }

    #[test]
    fn garbage_cursor_is_rejected() {
        assert!(decode_cursor("not-base64").is_err());
        assert!(decode_cursor("").is_err());

        let wrong_json = URL_SAFE_NO_PAD.encode(b"{\"value\":\"\"}");
        assert!(decode_cursor(&wrong_json).is_err());
    }

    #[test]
    fn limits_are_bounded() {
        assert_eq!(parse_limit(None).expect("default"), DEFAULT_LIMIT);
        assert_eq!(parse_limit(Some(1)).expect("min"), 1);
        assert_eq!(parse_limit(Some(100)).expect("max"), 100);
        assert!(parse_limit(Some(0)).is_err());
        assert!(parse_limit(Some(101)).is_err());
    }

    #[test]
    fn sorts_are_parsed() {
        assert_eq!(Sort::parse("rating_desc").expect("known"), Sort::RatingDesc);
        assert!(Sort::parse("random").is_err());
    }
}
