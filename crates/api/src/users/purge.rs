//! Hard deletion of accounts that were anonymised long enough ago.
//!
//! `DELETE /me` only anonymises the row and keeps the data while the person
//! might still change their mind. This task removes the row after the
//! retention period; PostgreSQL cascades items, tags, uploads and sessions.

use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::time::MissedTickBehavior;
use uuid::Uuid;

use crate::error::AppError;
use crate::media::LocalStorage;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub users_deleted: usize,
    pub files_deleted: usize,
}

/// Deletes every account whose `deleted_at` is older than the retention.
pub async fn run(
    pool: &PgPool,
    storage: &LocalStorage,
    retention_days: i32,
) -> Result<Report, AppError> {
    let users = sqlx::query_as::<_, (Uuid, Option<String>, Option<String>)>(
        "select id, avatar_key, banner_key
         from users
         where deleted_at is not null
           and deleted_at < now() - make_interval(days => $1)",
    )
    .bind(retention_days)
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)?;

    let mut report = Report::default();

    for (user_id, avatar_key, banner_key) in users {
        let mut keys = BTreeSet::new();

        if let Some(key) = avatar_key {
            keys.insert(key);
        }
        if let Some(key) = banner_key {
            keys.insert(key);
        }

        let uploads = sqlx::query_as::<_, (String, String, String)>(
            "select storage_key, large_key, preview_key from uploads where user_id = $1",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(AppError::internal)?;

        for (original, large, preview) in uploads {
            keys.insert(original);
            keys.insert(large);
            keys.insert(preview);
        }

        let covers: Vec<String> = sqlx::query_scalar(
            "select cover_key from items where user_id = $1 and cover_key is not null",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(AppError::internal)?;

        for key in covers {
            keys.insert(key);
        }

        let mut deleted_files = 0;
        for key in keys {
            if storage.delete(&key).await? {
                deleted_files += 1;
            }
        }

        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(AppError::internal)?;

        report.users_deleted += 1;
        report.files_deleted += deleted_files;

        tracing::info!(
            user_id = %user_id,
            files = deleted_files,
            "purged deleted account"
        );
    }

    Ok(report)
}

/// Runs once at startup and then once a day.
pub fn spawn(pool: PgPool, storage: Arc<LocalStorage>, retention_days: i32) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(24 * 60 * 60));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;

            match run(&pool, &storage, retention_days).await {
                Ok(report) if report.users_deleted > 0 => tracing::info!(
                    users = report.users_deleted,
                    files = report.files_deleted,
                    "account purge finished"
                ),
                Ok(_) => tracing::debug!("account purge: nothing to do"),
                Err(error) => tracing::error!(error = %error, "account purge failed"),
            }
        }
    });
}
