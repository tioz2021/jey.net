//! `POST /api/v1/import`: restore records from an export file.
//!
//! The whole file is validated before anything is written, and the writes run
//! in one transaction: a bad file never leaves a half-imported account.
//! Importing the same file twice changes nothing — ids are the key.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use chrono::{DateTime, Utc};
use jey_core::items::{NewItem, validate};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;

#[derive(Debug, Deserialize)]
pub struct ImportFile {
    pub items: Vec<ImportItem>,
}

#[derive(Debug, Deserialize)]
pub struct ImportItem {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(flatten)]
    pub item: NewItem,
}

/// `POST /api/v1/import`
pub async fn import(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<ImportFile>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let Json(file) = payload.map_err(|rejection| {
        AppError::validation(format!("import file is not valid JSON: {rejection}"))
    })?;

    if file.items.is_empty() {
        return Err(AppError::validation("import file contains no items"));
    }

    let mut records = Vec::with_capacity(file.items.len());
    let mut errors = Vec::new();

    for (index, entry) in file.items.iter().enumerate() {
        match validate::validate_new(&entry.item) {
            Ok(item) => {
                if !validate::status_allowed(item.kind, item.status) {
                    errors.push(json!({
                        "index": index,
                        "field": "status",
                        "message": format!(
                            "status {:?} is not allowed for a {:?}",
                            item.status, item.kind
                        ),
                    }));
                    continue;
                }

                records.push((
                    entry.id.unwrap_or_else(Uuid::new_v4),
                    entry.created_at.unwrap_or_else(Utc::now),
                    item,
                ));
            }
            Err(error) => errors.push(json!({
                "index": index,
                "message": error.to_string(),
            })),
        }
    }

    if !errors.is_empty() {
        return Err(AppError::validation_with_details(
            "import contains invalid items",
            json!({ "errors": errors }),
        ));
    }

    let total = records.len();
    let created = repo::import_items(&state.pool, current.user.id, &records).await?;

    Ok(Json(json!({
        "imported": created,
        "skipped": total - created,
        "total": total,
    })))
}
