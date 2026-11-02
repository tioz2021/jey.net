//! User records and the public representation used by auth handlers.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// What the API returns about a user. Never contains the password hash.
#[derive(Debug, Clone, Serialize)]
pub struct UserView {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub locale: String,
    pub email_verified: bool,
    pub is_public: bool,
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
    pub created_at: DateTime<Utc>,
    pub password_hash: String,
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
                   email_verified_at, is_public, created_at, password_hash",
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
                email_verified_at, is_public, created_at, password_hash
         from users
         where email = $1 and deleted_at is null",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
}

/// Finds a live user by identifier.
pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<UserRow>, AppError> {
    sqlx::query_as::<_, UserRow>(
        "select id, email::text as email, display_name, locale,
                email_verified_at, is_public, created_at, password_hash
         from users
         where id = $1 and deleted_at is null",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)
}

fn is_unique_violation(err: &sqlx::Error) -> bool {
    err.as_database_error()
        .and_then(|db| db.code())
        .is_some_and(|code| code == "23505")
}
