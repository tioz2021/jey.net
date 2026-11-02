//! `POST /api/v1/uploads`: accept an image and store it.

use axum::Json;
use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::media;

/// Field name expected in the multipart form.
const FILE_FIELD: &str = "file";

/// Distinguishes "too large" from "malformed" when the body cannot be read.
fn multipart_error(error: axum::extract::multipart::MultipartError) -> AppError {
    let message = error.to_string();

    if message.contains("length limit") || message.contains("body limit") {
        return AppError::payload_too_large("file is too large");
    }

    AppError::validation(format!("invalid multipart body: {message}"))
}

pub async fn upload(
    State(state): State<AppState>,
    current: CurrentUser,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut bytes = None;

    while let Some(field) = multipart.next_field().await.map_err(multipart_error)? {
        if field.name() == Some(FILE_FIELD) {
            let data = field.bytes().await.map_err(multipart_error)?;
            bytes = Some(data);
            break;
        }
    }

    let bytes = bytes.ok_or_else(|| AppError::validation_field(FILE_FIELD, "file is required"))?;

    let stored = media::save(&state.storage, current.user.id, &bytes).await?;

    sqlx::query(
        "insert into uploads
             (id, user_id, mime, size_bytes, sha256, storage_key,
              width, height, large_key, preview_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(stored.id)
    .bind(current.user.id)
    .bind(stored.mime)
    .bind(stored.size)
    .bind(&stored.sha256)
    .bind(&stored.storage_key)
    .bind(stored.width as i32)
    .bind(stored.height as i32)
    .bind(&stored.large_key)
    .bind(&stored.preview_key)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "upload": {
                "id": stored.id,
                "mime": stored.mime,
                "size_bytes": stored.size,
                "width": stored.width,
                "height": stored.height,
            }
        })),
    ))
}
