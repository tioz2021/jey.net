//! Role-based access for the admin area.

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

pub const USER: &str = "user";
pub const VIEWER: &str = "viewer";
pub const MODERATOR: &str = "moderator";
pub const ADMIN: &str = "admin";

pub async fn role(state: &AppState, user_id: uuid::Uuid) -> Result<String, AppError> {
    sqlx::query_scalar("select role from users where id = $1 and deleted_at is null")
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?
        .ok_or_else(|| AppError::forbidden("account is unavailable"))
}

pub async fn require_staff(state: &AppState, current: &CurrentUser) -> Result<String, AppError> {
    let role = role(state, current.user.id).await?;
    if role == USER {
        return Err(AppError::forbidden("staff only"));
    }
    Ok(role)
}

pub async fn require_moderator(
    state: &AppState,
    current: &CurrentUser,
) -> Result<String, AppError> {
    let role = require_staff(state, current).await?;
    if role != ADMIN && role != MODERATOR {
        return Err(AppError::forbidden("moderator only"));
    }
    Ok(role)
}

pub async fn require_admin(state: &AppState, current: &CurrentUser) -> Result<(), AppError> {
    let role = require_staff(state, current).await?;
    if role != ADMIN {
        return Err(AppError::forbidden("admin only"));
    }
    Ok(())
}
