//! Session tokens: generation, storage and cookie attributes.
//!
//! The token itself is never stored: the database keeps only its SHA-256 hash,
//! so a leaked dump does not hand out live sessions.

use axum::http::HeaderMap;
use chrono::{Duration, Utc};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::users::user::{self, UserRow};

/// Length of the raw session token in bytes.
const TOKEN_BYTES: usize = 32;

/// Cookie name used for the session token.
pub const SESSION_COOKIE: &str = "jey_session";

/// A freshly created session: the raw token goes to the client, never to the DB.
#[derive(Debug)]
pub struct CreatedSession {
    pub token: String,
}

/// A session resolved from a cookie, with the user it belongs to.
#[derive(Debug)]
pub struct AuthenticatedSession {
    pub session_id: Uuid,
    pub device_id: Option<Uuid>,
    pub user: UserRow,
}

/// Resolves the session cookie into a user.
///
/// Unknown, expired and malformed cookies all produce the same `401`.
pub async fn authenticate(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AuthenticatedSession, AppError> {
    let token = cookie_value(headers, SESSION_COOKIE).ok_or_else(unauthorized)?;
    let token_hash = hash_token(token);

    let session = sqlx::query_as::<_, SessionRow>(
        "select id, user_id, device_id
         from sessions
         where token_hash = $1 and expires_at > now()",
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;

    let Some(session) = session else {
        return Err(unauthorized());
    };

    let user = user::find_by_id(pool, session.user_id)
        .await?
        .ok_or_else(unauthorized)?;

    // Touching the row on every request would turn reads into writes; once per
    // five minutes is enough to keep `last_seen_at` useful.
    let _ = sqlx::query(
        "update sessions set last_seen_at = now()
         where id = $1 and last_seen_at < now() - interval '5 minutes'",
    )
    .bind(session.id)
    .execute(pool)
    .await;

    Ok(AuthenticatedSession {
        session_id: session.id,
        device_id: session.device_id,
        user,
    })
}

/// Deletes the session the cookie points at; idempotent by design.
///
/// Returns `true` when a session was actually removed.
pub async fn revoke_by_cookie(pool: &PgPool, headers: &HeaderMap) -> Result<bool, AppError> {
    let Some(token) = cookie_value(headers, SESSION_COOKIE) else {
        return Ok(false);
    };

    let result = sqlx::query("delete from sessions where token_hash = $1")
        .bind(hash_token(token))
        .execute(pool)
        .await
        .map_err(AppError::internal)?;

    Ok(result.rows_affected() > 0)
}

fn unauthorized() -> AppError {
    AppError::unauthorized("authentication required")
}

/// Reads one cookie value out of the `Cookie` header.
pub fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;

    raw.split(';').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key.trim() == name).then(|| value.trim())
    })
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

#[derive(Debug, sqlx::FromRow)]
struct SessionRow {
    id: Uuid,
    user_id: Uuid,
    device_id: Option<Uuid>,
}

/// `Set-Cookie` value that makes the browser drop the session cookie.
pub fn cleared_session_cookie(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };

    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

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

    fn headers_with_cookie(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            HeaderValue::from_str(value).expect("valid header"),
        );
        headers
    }

    #[test]
    fn cookie_is_found_among_others() {
        let headers = headers_with_cookie("theme=dark; jey_session=abc123; other=1");

        assert_eq!(cookie_value(&headers, SESSION_COOKIE), Some("abc123"));
        assert_eq!(cookie_value(&headers, "theme"), Some("dark"));
    }

    #[test]
    fn missing_cookie_is_none() {
        let headers = headers_with_cookie("theme=dark");

        assert_eq!(cookie_value(&headers, SESSION_COOKIE), None);
        assert_eq!(cookie_value(&HeaderMap::new(), SESSION_COOKIE), None);
    }

    #[test]
    fn malformed_cookie_header_is_none() {
        let headers = headers_with_cookie("jey_session");

        assert_eq!(cookie_value(&headers, SESSION_COOKIE), None);
    }

    #[test]
    fn cleared_cookie_expires_immediately() {
        let cookie = cleared_session_cookie(true);

        assert!(cookie.starts_with("jey_session=;"));
        assert!(cookie.contains("Max-Age=0"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.ends_with("; Secure"));
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
