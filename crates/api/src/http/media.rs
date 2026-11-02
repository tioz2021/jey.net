//! `GET /media/{*key}`: serves stored images with long-lived caching.
//!
//! Files are private to their owner; users with a public profile open their
//! media to everyone. Keys never change content, so the response can be
//! cached forever and revalidated with an ETag.

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;
use crate::media::storage;

const CACHE: &str = "public, max-age=31536000, immutable";

pub async fn serve_media(
    State(state): State<AppState>,
    Path(raw_key): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let key = raw_key.trim_start_matches('/').to_owned();

    storage::validate_key(&key)?;
    let owner_id = owner_of(&key)?;

    let viewer = session::authenticate(&state.pool, &headers).await.ok();
    let is_owner = viewer
        .as_ref()
        .is_some_and(|authenticated| authenticated.user.id == owner_id);

    let owner_public = sqlx::query_scalar::<_, bool>("select is_public from users where id = $1")
        .bind(owner_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?
        .ok_or_else(|| AppError::not_found("file not found"))?;

    if !is_owner && !owner_public {
        return Err(AppError::forbidden("media belongs to another account"));
    }

    let bytes = state
        .storage
        .get(&key)
        .await?
        .ok_or_else(|| AppError::not_found("file not found"))?;

    let etag = format!("\"{}\"", hex::encode(Sha256::digest(&bytes)));

    if headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        == Some(etag.as_str())
    {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        add_headers(&mut response, &key, &etag)?;

        return Ok(response);
    }

    let mut response = (StatusCode::OK, Body::from(bytes)).into_response();
    add_headers(&mut response, &key, &etag)?;

    Ok(response)
}

fn add_headers(response: &mut Response, key: &str, etag: &str) -> Result<(), AppError> {
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type(key)),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(CACHE));
    headers.insert(
        header::ETAG,
        HeaderValue::from_str(etag).map_err(AppError::internal)?,
    );

    Ok(())
}

fn content_type(key: &str) -> &'static str {
    if key.ends_with(".webp") {
        "image/webp"
    } else if key.ends_with(".jpg") || key.ends_with(".jpeg") {
        "image/jpeg"
    } else if key.ends_with(".png") {
        "image/png"
    } else {
        "application/octet-stream"
    }
}

/// Keys look like `u/{user_id}/{upload_id}/{file}`.
fn owner_of(key: &str) -> Result<Uuid, AppError> {
    let mut parts = key.split('/');
    let expected = (
        parts.next(),
        parts.next(),
        parts.next(),
        parts.next(),
        parts.next(),
    );

    let (Some("u"), Some(user), Some(_upload), Some(_file), None) = expected else {
        return Err(AppError::validation("invalid media key"));
    };

    Uuid::parse_str(user).map_err(|_| AppError::validation("invalid media key"))
}
