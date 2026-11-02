//! One-time tokens: issue, store as a hash, consume exactly once.

use chrono::{Duration, Utc};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// What a token is for. Matches the `purpose` check in the migration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Purpose {
    EmailVerification,
    PasswordReset,
}

impl Purpose {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::EmailVerification => "email_verification",
            Self::PasswordReset => "password_reset",
        }
    }
}

/// Lifetime of a confirmation link.
pub const EMAIL_VERIFICATION_TTL: Duration = Duration::hours(24);
/// Lifetime of a password reset link.
pub const PASSWORD_RESET_TTL: Duration = Duration::hours(1);

/// A freshly issued token; only the hash is stored.
#[derive(Debug)]
pub struct IssuedToken {
    pub token: String,
}

/// Issues a new token and invalidates previous unused ones of the same purpose.
pub async fn issue(
    pool: &PgPool,
    user_id: Uuid,
    purpose: Purpose,
    ttl: Duration,
) -> Result<IssuedToken, AppError> {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();
    let expires_at = Utc::now() + ttl;

    let mut transaction = pool.begin().await.map_err(AppError::internal)?;

    sqlx::query(
        "update auth_tokens set used_at = now()
         where user_id = $1 and purpose = $2 and used_at is null",
    )
    .bind(user_id)
    .bind(purpose.as_str())
    .execute(&mut *transaction)
    .await
    .map_err(AppError::internal)?;

    sqlx::query(
        "insert into auth_tokens (id, user_id, purpose, token_hash, expires_at)
         values ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(purpose.as_str())
    .bind(token_hash)
    .bind(expires_at)
    .execute(&mut *transaction)
    .await
    .map_err(AppError::internal)?;

    transaction.commit().await.map_err(AppError::internal)?;

    Ok(IssuedToken { token })
}

/// Marks the token as used and returns the user it belonged to.
///
/// Unknown, expired and already used tokens all give the same `400`.
pub async fn consume(pool: &PgPool, token: &str, purpose: Purpose) -> Result<Uuid, AppError> {
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();

    let user_id = sqlx::query_scalar::<_, Uuid>(
        "update auth_tokens set used_at = now()
         where token_hash = $1
           and purpose = $2
           and used_at is null
           and expires_at > now()
         returning user_id",
    )
    .bind(token_hash)
    .bind(purpose.as_str())
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;

    user_id.ok_or_else(|| AppError::validation_field("token", "token is invalid or has expired"))
}

/// Deletes tokens that expired long ago; safe to call from a maintenance task.
pub async fn purge_expired(pool: &PgPool) -> Result<u64, AppError> {
    let result =
        sqlx::query("delete from auth_tokens where expires_at < now() - interval '30 days'")
            .execute(pool)
            .await
            .map_err(AppError::internal)?;

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn purposes_match_the_database_check() {
        assert_eq!(Purpose::EmailVerification.as_str(), "email_verification");
        assert_eq!(Purpose::PasswordReset.as_str(), "password_reset");
    }

    #[test]
    fn lifetimes_are_sane() {
        assert!(EMAIL_VERIFICATION_TTL > PASSWORD_RESET_TTL);
        assert_eq!(EMAIL_VERIFICATION_TTL, Duration::hours(24));
        assert_eq!(PASSWORD_RESET_TTL, Duration::hours(1));
    }
}
