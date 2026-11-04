//! `GET /api/v1/export`: a user's records as JSON or CSV.

use axum::Json;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

#[derive(Debug, Default, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportFile {
    pub version: u32,
    pub exported_at: DateTime<Utc>,
    pub items: Vec<ItemView>,
}

/// `GET /api/v1/export?format=json|csv`
pub async fn export(
    State(state): State<AppState>,
    current: CurrentUser,
    query: Result<Query<ExportQuery>, QueryRejection>,
) -> Result<Response, AppError> {
    let Query(query) = query.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let items = repo::export_all(&state.pool, current.user.id).await?;
    let items: Vec<ItemView> = items.into_iter().map(ItemView::from).collect();

    match query.format.as_deref().unwrap_or("json") {
        "json" => {
            let file = ExportFile {
                version: 1,
                exported_at: Utc::now(),
                items,
            };

            Ok(Json(file).into_response())
        }
        "csv" => {
            let body = to_csv(&items);

            Ok((
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
                    (
                        header::CONTENT_DISPOSITION,
                        "attachment; filename=\"jey-items.csv\"",
                    ),
                ],
                body,
            )
                .into_response())
        }
        other => Err(AppError::validation_field(
            "format",
            format!("format must be json or csv; got {other:?}"),
        )),
    }
}

fn to_csv(items: &[ItemView]) -> String {
    let mut out = String::from(
        "id,kind,title,subtitle,year,status,rating,review,source_url,created_at,updated_at,deleted_at\n",
    );

    for item in items {
        let fields = [
            item.id.to_string(),
            item.kind.as_str().to_owned(),
            item.title.clone(),
            item.subtitle.clone().unwrap_or_default(),
            item.year.map(|year| year.to_string()).unwrap_or_default(),
            item.status.as_str().to_owned(),
            item.rating
                .map(|rating| rating.to_string())
                .unwrap_or_default(),
            item.review.clone().unwrap_or_default(),
            item.source_url.clone().unwrap_or_default(),
            item.created_at.to_rfc3339(),
            item.updated_at.to_rfc3339(),
            item.deleted_at
                .map(|value| value.to_rfc3339())
                .unwrap_or_default(),
        ];

        let row: Vec<String> = fields.iter().map(|value| quote(value)).collect();
        out.push_str(&row.join(","));
        out.push('\n');
    }

    out
}

/// Quotes a CSV field when it contains a separator, a quote or a line break.
fn quote(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fields_are_quoted_only_when_needed() {
        assert_eq!(quote("Dune"), "Dune");
        assert_eq!(quote("Herbert, Frank"), "\"Herbert, Frank\"");
        assert_eq!(quote("He said \"hi\""), "\"He said \"\"hi\"\"\"");
        assert_eq!(quote("line one\nline two"), "\"line one\nline two\"");
    }
}
