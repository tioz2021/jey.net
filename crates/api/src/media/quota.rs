//! Per-user storage quota.
//!
//! Usage is the sum of `uploads.total_bytes`, which includes the original and
//! both renditions. Deleting a cover deletes its upload rows, so the quota is
//! freed immediately.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// Default quota: 200 MB per account.
pub const DEFAULT_QUOTA_MB: u64 = 200;

/// Sum of stored bytes for one account.
pub async fn used_bytes(pool: &PgPool, user_id: Uuid) -> Result<i64, AppError> {
    sqlx::query_scalar::<_, Option<i64>>(
        "select coalesce(sum(total_bytes), 0)::bigint from uploads where user_id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map(|value| value.unwrap_or(0))
    .map_err(AppError::internal)
}

/// Rejects the upload when it would not fit into the account's quota.
pub fn ensure_fits(limit_bytes: i64, used_bytes: i64, incoming_bytes: i64) -> Result<(), AppError> {
    if used_bytes + incoming_bytes > limit_bytes {
        return Err(AppError::payload_too_large(format!(
            "storage limit exceeded: {} of {} MB used",
            mb(used_bytes),
            mb(limit_bytes)
        )));
    }

    Ok(())
}

fn mb(bytes: i64) -> i64 {
    bytes / (1024 * 1024)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MB: i64 = 1024 * 1024;

    #[test]
    fn fits_within_the_limit() {
        assert!(ensure_fits(200 * MB, 100 * MB, 50 * MB).is_ok());
        assert!(ensure_fits(200 * MB, 199 * MB, MB).is_ok());
    }

    #[test]
    fn rejects_when_over_the_limit() {
        let error = ensure_fits(200 * MB, 199 * MB, 2 * MB).expect_err("must reject");
        let message = error.to_string();

        assert!(message.contains("199 of 200 MB"), "message: {message}");
    }

    #[test]
    fn percentage_is_not_rounded_up_in_the_message() {
        let error = ensure_fits(200 * MB, 150 * MB, 100 * MB).expect_err("must reject");
        assert!(error.to_string().contains("150 of 200 MB"));
    }
}
