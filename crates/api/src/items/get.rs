//! `GET /api/v1/items/{id}`: read a single record.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

pub async fn get_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let id = parse_id(&raw_id)?;

    let item = repo::get(&state.pool, current.user.id, id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    Ok(Json(json!({ "item": ItemView::from(item) })))
}

/// A malformed identifier is the client's mistake, not a missing record.
pub fn parse_id(raw: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(raw).map_err(|_| AppError::validation_field("id", "id must be a UUID"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_uuid_is_accepted() {
        let id = Uuid::new_v4();
        assert_eq!(parse_id(&id.to_string()).expect("parses"), id);
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(parse_id("not-a-uuid").is_err());
        assert!(parse_id("").is_err());
    }
}
