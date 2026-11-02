//! Collects media files that nothing references any more.
//!
//! A file is kept when an item covers it, a profile uses it as an avatar, or
//! its upload row is younger than a day (the person may still be editing the
//! record). Everything else is removed. Running it twice is harmless.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use sqlx::PgPool;

use crate::error::AppError;
use crate::media::LocalStorage;

/// Files younger than this are never touched.
pub const GRACE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct Report {
    pub uploads_deleted: usize,
    pub files_deleted: usize,
    pub bytes_freed: u64,
}

struct UploadRow {
    id: uuid::Uuid,
    keys: [String; 3],
    old: bool,
}

pub async fn run(pool: &PgPool, storage: &LocalStorage, root: &Path) -> Result<Report, AppError> {
    let cutoff = SystemTime::now()
        .checked_sub(GRACE)
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let mut referenced = referenced_keys(pool).await?;
    let uploads = upload_rows(pool, cutoff).await?;

    let mut report = Report::default();

    for upload in &uploads {
        if referenced.contains(&upload.keys[1]) {
            referenced.extend(upload.keys.iter().cloned());
            continue;
        }

        if upload.old {
            for key in &upload.keys {
                report.bytes_freed += remove_file(storage, root, key).await?;
            }

            sqlx::query("delete from uploads where id = $1")
                .bind(upload.id)
                .execute(pool)
                .await
                .map_err(AppError::internal)?;

            report.uploads_deleted += 1;
            report.files_deleted += upload.keys.len();
        } else {
            referenced.extend(upload.keys.iter().cloned());
        }
    }

    // Stray files: not referenced and older than the grace period.
    for (key, modified) in walk(root).await? {
        if referenced.contains(&key) || modified >= cutoff {
            continue;
        }

        report.bytes_freed += remove_file(storage, root, &key).await?;
        report.files_deleted += 1;
    }

    Ok(report)
}

async fn referenced_keys(pool: &PgPool) -> Result<HashSet<String>, AppError> {
    let mut keys = HashSet::new();

    let covers: Vec<String> =
        sqlx::query_scalar("select cover_key from items where cover_key is not null")
            .fetch_all(pool)
            .await
            .map_err(AppError::internal)?;
    keys.extend(covers);

    let avatars: Vec<String> =
        sqlx::query_scalar("select avatar_key from users where avatar_key is not null")
            .fetch_all(pool)
            .await
            .map_err(AppError::internal)?;
    keys.extend(avatars);

    Ok(keys)
}

async fn upload_rows(pool: &PgPool, cutoff: SystemTime) -> Result<Vec<UploadRow>, AppError> {
    let rows = sqlx::query_as::<
        _,
        (
            uuid::Uuid,
            String,
            String,
            String,
            chrono::DateTime<chrono::Utc>,
        ),
    >("select id, storage_key, large_key, preview_key, created_at from uploads")
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)?;

    Ok(rows
        .into_iter()
        .map(|(id, storage_key, large_key, preview_key, created_at)| {
            let old = created_at < chrono::DateTime::<chrono::Utc>::from(cutoff);

            UploadRow {
                id,
                keys: [storage_key, large_key, preview_key],
                old,
            }
        })
        .collect())
}

async fn remove_file(storage: &LocalStorage, root: &Path, key: &str) -> Result<u64, AppError> {
    let size = tokio::fs::metadata(root.join(key))
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    storage.delete(key).await?;

    Ok(size)
}

/// Lists every file under the media root with its modification time.
async fn walk(root: &Path) -> Result<Vec<(String, SystemTime)>, AppError> {
    let mut files = Vec::new();
    let mut pending: Vec<PathBuf> = vec![root.to_path_buf()];

    while let Some(directory) = pending.pop() {
        let mut entries = match tokio::fs::read_dir(&directory).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(AppError::internal(error)),
        };

        while let Some(entry) = entries.next_entry().await.map_err(AppError::internal)? {
            let path = entry.path();
            let metadata = entry.metadata().await.map_err(AppError::internal)?;

            if metadata.is_dir() {
                pending.push(path);
                continue;
            }

            let Ok(key) = path.strip_prefix(root) else {
                continue;
            };
            let key = key.to_string_lossy().replace('\\', "/");
            let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);

            files.push((key, modified));
        }
    }

    Ok(files)
}
