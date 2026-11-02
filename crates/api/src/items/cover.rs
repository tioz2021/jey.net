//! Attaching an uploaded image to a record as its cover.
//!
//! A cover stores the key of the 1200 px rendition. Replacing or removing a
//! cover deletes the upload row and all of its files: an unreferenced upload
//! would otherwise stay on disk forever.

use axum::Json;
use axum::extract::{Path, State};
use jey_core::items::Item;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::get::parse_id;
use crate::items::repo;
use crate::items::view::ItemView;
use crate::media::LocalStorage;

#[derive(Debug, Deserialize)]
pub struct CoverInput {
    pub upload_id: Uuid,
}

struct UploadRow {
    id: Uuid,
    storage_key: String,
    large_key: String,
    preview_key: String,
}

/// `POST /api/v1/items/{id}/cover`
pub async fn set_cover(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
    Json(payload): Json<CoverInput>,
) -> Result<Json<Value>, AppError> {
    let item_id = parse_id(&raw_id)?;

    let item = apply_cover(
        &state.pool,
        &state.storage,
        current.user.id,
        item_id,
        payload.upload_id,
    )
    .await?;

    Ok(Json(json!({ "item": ItemView::from(item) })))
}

/// `DELETE /api/v1/items/{id}/cover`
pub async fn clear_cover(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(raw_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let item_id = parse_id(&raw_id)?;

    let item = remove_cover(&state.pool, &state.storage, current.user.id, item_id).await?;

    Ok(Json(json!({ "item": ItemView::from(item) })))
}

async fn apply_cover(
    pool: &PgPool,
    storage: &LocalStorage,
    user_id: Uuid,
    item_id: Uuid,
    upload_id: Uuid,
) -> Result<Item, AppError> {
    let existing = repo::get(pool, user_id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    let upload = find_upload(pool, user_id, upload_id)
        .await?
        .ok_or_else(|| AppError::not_found("upload not found"))?;

    // Detach the previous cover first: its upload is no longer referenced.
    if let Some(old_key) = existing.cover_key.as_deref()
        && old_key != upload.large_key
    {
        release_by_key(pool, storage, user_id, old_key).await?;
    }

    sqlx::query(
        "update items set cover_key = $3, revision = revision + 1
         where id = $1 and user_id = $2 and deleted_at is null",
    )
    .bind(item_id)
    .bind(user_id)
    .bind(&upload.large_key)
    .execute(pool)
    .await
    .map_err(AppError::internal)?;

    repo::get(pool, user_id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))
}

async fn remove_cover(
    pool: &PgPool,
    storage: &LocalStorage,
    user_id: Uuid,
    item_id: Uuid,
) -> Result<Item, AppError> {
    let existing = repo::get(pool, user_id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))?;

    if let Some(key) = existing.cover_key.as_deref() {
        release_by_key(pool, storage, user_id, key).await?;
    }

    sqlx::query(
        "update items set cover_key = null, revision = revision + 1
         where id = $1 and user_id = $2 and deleted_at is null",
    )
    .bind(item_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(AppError::internal)?;

    repo::get(pool, user_id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item not found"))
}

async fn find_upload(
    pool: &PgPool,
    user_id: Uuid,
    upload_id: Uuid,
) -> Result<Option<UploadRow>, AppError> {
    sqlx::query_as::<_, (Uuid, String, String, String)>(
        "select id, storage_key, large_key, preview_key
         from uploads
         where id = $1 and user_id = $2",
    )
    .bind(upload_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
    .map(|row| {
        row.map(|(id, storage_key, large_key, preview_key)| UploadRow {
            id,
            storage_key,
            large_key,
            preview_key,
        })
    })
}

/// Finds an upload by its large rendition key and deletes it with its files.
async fn release_by_key(
    pool: &PgPool,
    storage: &LocalStorage,
    user_id: Uuid,
    large_key: &str,
) -> Result<(), AppError> {
    let upload = sqlx::query_as::<_, (Uuid, String, String, String)>(
        "select id, storage_key, large_key, preview_key
         from uploads
         where user_id = $1 and large_key = $2",
    )
    .bind(user_id)
    .bind(large_key)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .map(|(id, storage_key, large_key, preview_key)| UploadRow {
        id,
        storage_key,
        large_key,
        preview_key,
    });

    if let Some(upload) = upload {
        delete_upload(pool, storage, user_id, &upload).await?;
    }

    Ok(())
}

async fn delete_upload(
    pool: &PgPool,
    storage: &LocalStorage,
    user_id: Uuid,
    upload: &UploadRow,
) -> Result<(), AppError> {
    for key in [&upload.storage_key, &upload.large_key, &upload.preview_key] {
        storage.delete(key).await?;
    }

    sqlx::query("delete from uploads where id = $1 and user_id = $2")
        .bind(upload.id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;

    Ok(())
}
