//! Session tokens: generation, storage and cookie attributes.
//!
//! The token itself is never stored: the database keeps only its SHA-256 hash,
//! so a leaked dump does not hand out live sessions.

use chrono::{Duration, Utc};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

/// Length of the raw session token in bytes.
const TOKEN_BYTES: usize = 32;

/// Cookie name used for the session token.
pub const SESSION_COOKIE: &str = "jey_session";

/// A freshly created session: the raw token goes to the client, never to the DB.
#[derive(Debug)]
pub struct CreatedSession {
    pub token: String,
}

/// Generates a new random token (32 bytes, hex encoded).
pub fn generate_token() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Hashes a token the way it is stored in `sessions.token_hash`.
pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Stores a session row and returns the raw token for the cookie.
pub async fn create_session(
    pool: &PgPool,
    user_id: Uuid,
    device_id: Option<Uuid>,
    ttl_days: u32,
    user_agent: Option<&str>,
) -> Result<CreatedSession, sqlx::Error> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::days(i64::from(ttl_days));
    let user_agent = user_agent.map(|value| value.chars().take(512).collect::<String>());

    sqlx::query(
        "insert into sessions (id, user_id, device_id, token_hash, expires_at, user_agent)
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(device_id)
    .bind(hash_token(&token))
    .bind(expires_at)
    .bind(user_agent)
    .execute(pool)
    .await?;

    Ok(CreatedSession { token })
}

/// Builds the `Set-Cookie` value for a session.
pub fn session_cookie(token: &str, ttl_days: u32, secure: bool) -> String {
    let max_age = u64::from(ttl_days) * 24 * 60 * 60;
    let secure = if secure { "; Secure" } else { "" };

    format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_long_enough() {
        let first = generate_token();
        let second = generate_token();

        assert_eq!(first.len(), TOKEN_BYTES * 2);
        assert_ne!(first, second);
        assert!(first.chars().all(|ch| ch.is_ascii_hexdigit()));
    }

    #[test]
    fn hashing_is_stable_and_not_reversible_to_the_token() {
        let token = "0123456789abcdef";
        let hash = hash_token(token);

        assert_eq!(hash.len(), 32);
        assert_eq!(hash, hash_token(token));
        assert_ne!(hash, hash_token("another-token"));
    }

    #[test]
    fn cookie_has_security_attributes() {
        let cookie = session_cookie("abc", 30, true);

        assert!(cookie.starts_with("jey_session=abc;"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(cookie.contains("Path=/"));
        assert!(cookie.contains("Max-Age=2592000"));
        assert!(cookie.ends_with("; Secure"));

        let insecure = session_cookie("abc", 1, false);
        assert!(!insecure.contains("Secure"));
    }
}
