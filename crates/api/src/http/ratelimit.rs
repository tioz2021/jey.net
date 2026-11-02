//! Rate limiting for credential endpoints.
//!
//! Counters live in PostgreSQL: they survive restarts and work with several
//! API instances, which an in-memory map would not. The algorithm is a fixed
//! window per key with an optional block once the limit is exceeded.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::error::AppError;

/// One limit: how many attempts per window, and for how long to block.
#[derive(Debug, Clone, Copy)]
pub struct Rule {
    pub limit: i64,
    pub window: Duration,
    pub block: Duration,
}

/// Failed logins per IP and email: 5 in a minute, then 15 minutes of silence.
pub const LOGIN: Rule = Rule {
    limit: 5,
    window: Duration::from_secs(60),
    block: Duration::from_secs(15 * 60),
};

/// Registrations per IP: 3 in an hour.
pub const REGISTER: Rule = Rule {
    limit: 3,
    window: Duration::from_secs(60 * 60),
    block: Duration::from_secs(60 * 60),
};

/// Checks the rule for `key`, recording this attempt.
///
/// Returns `Err(AppError::RateLimited)` when the caller must be turned away.
pub async fn enforce(pool: &PgPool, rule: Rule, key: &str) -> Result<(), AppError> {
    let window_secs = rule.window.as_secs().min(i32::MAX as u64) as i32;
    let block_secs = rule.block.as_secs().min(i32::MAX as u64) as i32;

    let row = sqlx::query_as::<_, RateLimitRow>(
        "insert into rate_limits (key, window_started_at, attempts)
         values ($1, now(), 1)
         on conflict (key) do update set
             attempts = case
                 when rate_limits.window_started_at <= now() - make_interval(secs => $2)
                     then 1
                 else rate_limits.attempts + 1
             end,
             window_started_at = case
                 when rate_limits.window_started_at <= now() - make_interval(secs => $2)
                     then now()
                 else rate_limits.window_started_at
             end,
             blocked_until = case
                 when rate_limits.window_started_at <= now() - make_interval(secs => $2)
                     then null
                 when rate_limits.attempts + 1 > $3
                      and (rate_limits.blocked_until is null
                           or rate_limits.blocked_until <= now())
                     then now() + make_interval(secs => $4)
                 else rate_limits.blocked_until
             end,
             updated_at = now()
         returning attempts, blocked_until",
    )
    .bind(key)
    .bind(window_secs)
    .bind(rule.limit)
    .bind(block_secs)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;

    cleanup_occasionally(pool).await;

    if let Some(blocked_until) = row.blocked_until
        && blocked_until > Utc::now()
    {
        let retry_after = (blocked_until - Utc::now()).num_seconds().max(1) as u64;
        return Err(AppError::rate_limited("too many attempts", retry_after));
    }

    Ok(())
}

/// Returns the caller address, preferring the reverse proxy header.
///
/// The API is only reachable through Caddy in production, so trusting the first
/// `X-Forwarded-For` entry is deliberate; locally the peer address is used.
pub fn client_ip(headers: &HeaderMap, peer: SocketAddr) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| peer.ip().to_string())
}

#[derive(Debug, sqlx::FromRow)]
struct RateLimitRow {
    #[allow(dead_code)]
    attempts: i32,
    blocked_until: Option<DateTime<Utc>>,
}

/// Deletes stale counters now and then, without a background task.
async fn cleanup_occasionally(pool: &PgPool) {
    static CALLS: AtomicU64 = AtomicU64::new(0);

    if CALLS.fetch_add(1, Ordering::Relaxed) % 256 == 0 {
        let _ = sqlx::query("delete from rate_limits where updated_at < now() - interval '1 day'")
            .execute(pool)
            .await;
    }
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, Ipv4Addr};

    use axum::http::HeaderValue;

    use super::*;

    fn peer() -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 5000)
    }

    fn headers_with(name: &'static str, value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(name, HeaderValue::from_str(value).expect("valid header"));
        headers
    }

    #[test]
    fn forwarded_for_wins() {
        let headers = headers_with("x-forwarded-for", "203.0.113.7, 10.0.0.1");

        assert_eq!(client_ip(&headers, peer()), "203.0.113.7");
    }

    #[test]
    fn peer_is_used_without_the_header() {
        assert_eq!(client_ip(&HeaderMap::new(), peer()), "10.0.0.1");
    }

    #[test]
    fn empty_forwarded_for_falls_back_to_peer() {
        let headers = headers_with("x-forwarded-for", "  ");

        assert_eq!(client_ip(&headers, peer()), "10.0.0.1");
    }
}
