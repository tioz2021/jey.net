//! Global site announcement and maintenance switches.

use axum::Json;
use axum::extract::State;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SiteSettings {
    pub announcement: Option<String>,
    pub announcement_active: bool,
    pub maintenance: bool,
    pub registration_enabled: bool,
    pub updated_at: DateTime<Utc>,
}

pub async fn settings(pool: &sqlx::PgPool) -> Result<SiteSettings, AppError> {
    sqlx::query_as(
        "select announcement, announcement_active, maintenance,
                registration_enabled, updated_at
         from site_settings where id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

pub async fn registration_enabled(pool: &sqlx::PgPool) -> Result<bool, AppError> {
    sqlx::query_scalar("select registration_enabled from site_settings where id = 1")
        .fetch_optional(pool)
        .await
        .map_err(AppError::internal)
        .map(|value| value.unwrap_or(true))
}

/// `GET /api/v1/site/status` — public banner data.
pub async fn public_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let settings = settings(&state.pool).await?;
    Ok(Json(json!({
        "announcement": if settings.announcement_active { settings.announcement } else { None },
        "maintenance": settings.maintenance,
        "registration_enabled": settings.registration_enabled,
    })))
}

#[derive(Debug, Deserialize)]
pub struct SitePatch {
    pub announcement: Option<String>,
    pub announcement_active: Option<bool>,
    pub maintenance: Option<bool>,
    pub registration_enabled: Option<bool>,
}

/// `GET /api/v1/admin/site`
pub async fn get_admin(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    crate::users::access::require_admin(&state, &current).await?;
    Ok(Json(json!({ "settings": settings(&state.pool).await? })))
}

/// `PATCH /api/v1/admin/site`
pub async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<SitePatch>,
) -> Result<Json<Value>, AppError> {
    crate::users::access::require_admin(&state, &current).await?;
    let announcement = payload
        .announcement
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if announcement.is_some_and(|value| value.chars().count() > 500) {
        return Err(AppError::validation_field(
            "announcement",
            "announcement is too long",
        ));
    }
    let settings: SiteSettings = sqlx::query_as(
        "update site_settings set
             announcement = $1,
             announcement_active = coalesce($2, announcement_active),
             maintenance = coalesce($3, maintenance),
             registration_enabled = coalesce($4, registration_enabled),
             updated_at = now()
         where id = 1
         returning announcement, announcement_active, maintenance,
                   registration_enabled, updated_at",
    )
    .bind(announcement)
    .bind(payload.announcement_active)
    .bind(payload.maintenance)
    .bind(payload.registration_enabled)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    crate::audit::record(
        &state,
        &current,
        "site.updated",
        "site",
        None,
        None,
        json!({
            "announcement_active": settings.announcement_active,
            "maintenance": settings.maintenance,
            "registration_enabled": settings.registration_enabled,
        }),
    )
    .await;
    Ok(Json(json!({ "settings": settings })))
}
