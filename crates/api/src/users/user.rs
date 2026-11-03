//! User records and the public representation used by auth handlers.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// Locales the interface supports right now.
pub const SUPPORTED_LOCALES: &[&str] = &["ru", "en", "uk"];

/// Longest accepted display name.
pub const MAX_DISPLAY_NAME_LENGTH: usize = 60;

/// What the API returns about a user. Never contains the password hash.
#[derive(Debug, Clone, Serialize)]
pub struct UserView {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub locale: String,
    pub email_verified: bool,
    pub is_public: bool,
    pub public_statuses: Vec<String>,
    pub public_show_progress: bool,
    pub avatar_key: Option<String>,
    pub banner_key: Option<String>,
    pub has_password: bool,
    pub created_at: DateTime<Utc>,
}

/// Full row, including the password hash, for internal use only.
#[derive(Debug, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub locale: String,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub is_public: bool,
    pub public_statuses: Vec<String>,
    pub public_show_progress: bool,
    pub avatar_key: Option<String>,
    pub banner_key: Option<String>,
    pub created_at: DateTime<Utc>,
    pub password_hash: Option<String>,
    pub google_sub: Option<String>,
}

impl From<UserRow> for UserView {
    fn from(row: UserRow) -> Self {
        Self {
            id: row.id,
            email: row.email,
            display_name: row.display_name,
            locale: row.locale,
            email_verified: row.email_verified_at.is_some(),
            is_public: row.is_public,
            public_statuses: row.public_statuses,
            public_show_progress: row.public_show_progress,
            avatar_key: row.avatar_key,
            banner_key: row.banner_key,
            has_password: row.password_hash.is_some(),
            created_at: row.created_at,
        }
    }
}

/// Inserts a new user, mapping a duplicate email to a conflict error.
pub async fn create(
    pool: &PgPool,
    email: &str,
    password_hash: &str,
    display_name: &str,
) -> Result<UserView, AppError> {
    let result = sqlx::query_as::<_, UserRow>(
        "insert into users (id, email, password_hash, display_name)
         values ($1, $2, $3, $4)
         returning id, email::text as email, display_name, locale,
                   email_verified_at, is_public, public_statuses, public_show_progress, avatar_key, banner_key, created_at, password_hash, google_sub",
    )
    .bind(Uuid::new_v4())
    .bind(email)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await;

    match result {
        Ok(row) => Ok(row.into()),
        Err(err) if is_unique_violation(&err) => Err(AppError::conflict(
            "an account with this email already exists",
        )),
        Err(err) => Err(AppError::internal(err)),
    }
}

/// Finds a live user by email; soft-deleted accounts are invisible.
pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<UserRow>, AppError> {
    sqlx::query_as::<_, UserRow>(
        "select id, email::text as email, display_name, locale,
                email_verified_at, is_public, public_statuses, public_show_progress, avatar_key, banner_key, created_at, password_hash, google_sub
         from users
         where email = $1 and deleted_at is null",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
}

/// Finds a live user by Google subject.
pub async fn find_by_google_sub(
    pool: &PgPool,
    google_sub: &str,
) -> Result<Option<UserRow>, AppError> {
    sqlx::query_as::<_, UserRow>(
        "select id, email::text as email, display_name, locale,
                email_verified_at, is_public, public_statuses, public_show_progress, avatar_key, banner_key, created_at, password_hash, google_sub
         from users
         where google_sub = $1 and deleted_at is null",
    )
    .bind(google_sub)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
}

/// Creates an account that has no password and signs in with Google.
pub async fn create_google(
    pool: &PgPool,
    email: &str,
    display_name: &str,
    google_sub: &str,
) -> Result<UserView, AppError> {
    let result = sqlx::query_as::<_, UserRow>(
        "insert into users (id, email, display_name, google_sub, email_verified_at)
         values ($1, $2, $3, $4, now())
         returning id, email::text as email, display_name, locale,
                   email_verified_at, is_public, public_statuses, public_show_progress, avatar_key, banner_key, created_at, password_hash, google_sub",
    )
    .bind(Uuid::new_v4())
    .bind(email)
    .bind(display_name)
    .bind(google_sub)
    .fetch_one(pool)
    .await;

    match result {
        Ok(row) => Ok(row.into()),
        Err(err) if is_unique_violation(&err) => Err(AppError::conflict(
            "an account with this email already exists",
        )),
        Err(err) => Err(AppError::internal(err)),
    }
}

/// Attaches a Google subject to an existing account.
pub async fn link_google(pool: &PgPool, user_id: Uuid, google_sub: &str) -> Result<(), AppError> {
    sqlx::query("update users set google_sub = $2 where id = $1 and google_sub is null")
        .bind(user_id)
        .bind(google_sub)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;

    Ok(())
}

/// Finds a live user by identifier.
pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<UserRow>, AppError> {
    sqlx::query_as::<_, UserRow>(
        "select id, email::text as email, display_name, locale,
                email_verified_at, is_public, public_statuses, public_show_progress, avatar_key, banner_key, created_at, password_hash, google_sub
         from users
         where id = $1 and deleted_at is null",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
}

/// Trims and validates a display name.
pub fn validate_display_name(display_name: &str) -> Result<String, AppError> {
    let trimmed = display_name.trim();
    let length = trimmed.chars().count();

    if !(1..=MAX_DISPLAY_NAME_LENGTH).contains(&length) {
        return Err(AppError::validation_field(
            "display_name",
            format!("display name must be between 1 and {MAX_DISPLAY_NAME_LENGTH} characters"),
        ));
    }

    Ok(trimmed.to_owned())
}

/// Checks that a locale is one the interface knows about.
pub fn validate_locale(locale: &str) -> Result<(), AppError> {
    if SUPPORTED_LOCALES.contains(&locale) {
        return Ok(());
    }

    Err(AppError::validation_field(
        "locale",
        format!("locale must be one of: {}", SUPPORTED_LOCALES.join(", ")),
    ))
}

fn is_unique_violation(err: &sqlx::Error) -> bool {
    err.as_database_error()
        .and_then(|db| db.code())
        .is_some_and(|code| code == "23505")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_name_is_trimmed_and_bounded() {
        assert_eq!(validate_display_name("  Jey  ").unwrap(), "Jey");
        assert!(validate_display_name("").is_err());
        assert!(validate_display_name(&"a".repeat(61)).is_err());
        assert!(validate_display_name(&"a".repeat(60)).is_ok());
    }

    #[test]
    fn only_supported_locales_pass() {
        assert!(validate_locale("ru").is_ok());
        assert!(validate_locale("en").is_ok());
        assert!(validate_locale("uk").is_ok());

        for bad in ["de", "russian", "RU", ""] {
            assert!(validate_locale(bad).is_err(), "{bad} must be rejected");
        }
    }
}
