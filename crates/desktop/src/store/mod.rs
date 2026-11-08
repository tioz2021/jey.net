//! Local SQLite store for the desktop client.
//!
//! The schema mirrors the catalogue plus the three sync tables described in
//! `docs/sync.md`. The server remains the sync hub; this database is the
//! client's own source of truth while offline.

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

pub mod collections;
pub mod comments;
mod export;
mod media;
mod repository;
mod settings;
mod sync;
pub use export::{BackupReport, ExportReport, backup, export_json};
pub use repository::SqliteItems;
pub use sync::RemoteChange;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/0001_init.sql")),
    (2, include_str!("../../migrations/0002_comments.sql")),
    (
        3,
        include_str!("../../migrations/0003_social_tombstones.sql"),
    ),
    (
        4,
        include_str!("../../migrations/0004_comment_reactions.sql"),
    ),
];

fn copy_dir(source: &Path, target: &Path) -> Result<(), StoreError> {
    if !source.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &destination)?;
        } else {
            std::fs::copy(&path, &destination)?;
        }
    }
    Ok(())
}

#[derive(Debug)]
pub enum StoreError {
    Sql(rusqlite::Error),
    Io(std::io::Error),
    Invalid(String),
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sql(error) => write!(formatter, "local database: {error}"),
            Self::Io(error) => write!(formatter, "local database I/O: {error}"),
            Self::Invalid(message) => write!(formatter, "local database: {message}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

impl From<std::io::Error> for StoreError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StoreStatus {
    pub path: String,
    pub schema_version: i64,
    pub items: i64,
    pub outbox: i64,
    pub conflicts: i64,
    pub last_sync_seq: i64,
    pub media_files: i64,
}

/// Thread-safe handle used by Tauri commands and the sync worker.
#[derive(Clone)]
pub struct DesktopStore {
    connection: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl fmt::Debug for DesktopStore {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("DesktopStore")
            .field("path", &self.path)
            .finish()
    }
}

impl DesktopStore {
    /// Opens (and migrates) `jey.db` inside the application data directory.
    pub fn open(data_dir: impl AsRef<Path>) -> Result<Self, StoreError> {
        let data_dir = data_dir.as_ref();
        std::fs::create_dir_all(data_dir)?;
        let path = data_dir.join("jey.db");
        let connection = Connection::open(&path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let store = Self {
            connection: Arc::new(Mutex::new(connection)),
            path,
        };
        store.backup_before_migration()?;
        store.migrate()?;
        Ok(store)
    }

    /// Opens an in-memory store; useful for tests and previews.
    pub fn in_memory() -> Result<Self, StoreError> {
        let connection = Connection::open_in_memory()?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let store = Self {
            connection: Arc::new(Mutex::new(connection)),
            path: PathBuf::from(":memory:"),
        };
        store.migrate()?;
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Copies the database and media cache into a new directory. The source
    /// stays intact until the next start, so an interrupted copy is harmless.
    pub fn copy_to(&self, target: &Path) -> Result<(), StoreError> {
        std::fs::create_dir_all(target)?;
        {
            let connection = self.connection()?;
            connection.execute_batch("pragma wal_checkpoint(truncate);")?;
        }
        std::fs::copy(&self.path, target.join("jey.db"))?;
        let source_dir = self.path.parent().unwrap_or_else(|| Path::new("."));
        for name in ["access.json", "session.json"] {
            let source = source_dir.join(name);
            if source.is_file() {
                std::fs::copy(&source, target.join(name))?;
            }
        }
        copy_dir(&self.media_dir(), &target.join("media"))?;
        Ok(())
    }

    pub fn connection(&self) -> Result<MutexGuard<'_, Connection>, StoreError> {
        self.connection
            .lock()
            .map_err(|_| StoreError::Invalid("database lock poisoned".to_owned()))
    }

    fn backup_before_migration(&self) -> Result<(), StoreError> {
        if self.path == Path::new(":memory:") {
            return Ok(());
        }
        let connection = self.connection()?;
        let has_table: Option<i64> = connection
            .query_row(
                "select 1 from sqlite_master where type = 'table' and name = '_local_migrations'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let Some(_) = has_table else {
            return Ok(());
        };
        let current: i64 = connection.query_row(
            "select coalesce(max(version), 0) from _local_migrations",
            [],
            |row| row.get(0),
        )?;
        let latest = MIGRATIONS.last().map(|(version, _)| *version).unwrap_or(0);
        if current == 0 || current >= latest {
            return Ok(());
        }
        let data_dir = self.path.parent().unwrap_or_else(|| Path::new("."));
        let backup_dir = data_dir
            .join("backups")
            .join(format!("pre-migration-v{current}-{}", now_millis()));
        std::fs::create_dir_all(&backup_dir)?;
        connection.execute(
            "VACUUM INTO ?1",
            [backup_dir.join("jey.db").to_string_lossy().as_ref()],
        )?;
        std::fs::write(
            backup_dir.join("manifest.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "version": 1,
                "kind": "pre_migration",
                "schema_version": current,
                "created_at": now_millis(),
            }))
            .map_err(|error| StoreError::Invalid(error.to_string()))?,
        )?;
        Ok(())
    }

    pub fn migrate(&self) -> Result<(), StoreError> {
        let mut connection = self.connection()?;
        connection.execute_batch(
            "create table if not exists _local_migrations (
                version integer primary key,
                applied_at integer not null
            );",
        )?;
        for (version, sql) in MIGRATIONS {
            let applied: Option<i64> = connection
                .query_row(
                    "select version from _local_migrations where version = ?1",
                    [version],
                    |row| row.get(0),
                )
                .optional()?;
            if applied.is_some() {
                continue;
            }
            let transaction = connection.transaction()?;
            transaction.execute_batch(sql)?;
            transaction.execute(
                "insert into _local_migrations (version, applied_at) values (?1, ?2)",
                params![version, now_millis()],
            )?;
            transaction.commit()?;
        }
        Ok(())
    }

    pub fn schema_version(&self) -> Result<i64, StoreError> {
        let connection = self.connection()?;
        Ok(connection.query_row(
            "select coalesce(max(version), 0) from _local_migrations",
            [],
            |row| row.get(0),
        )?)
    }

    pub fn last_sync_seq(&self) -> Result<i64, StoreError> {
        let connection = self.connection()?;
        Ok(connection.query_row(
            "select last_sync_seq from sync_state where id = 1",
            [],
            |row| row.get(0),
        )?)
    }

    pub fn status(&self) -> Result<StoreStatus, StoreError> {
        let connection = self.connection()?;
        let items = connection.query_row("select count(*) from items", [], |row| row.get(0))?;
        let outbox = connection.query_row("select count(*) from outbox", [], |row| row.get(0))?;
        let conflicts =
            connection.query_row("select count(*) from conflicts", [], |row| row.get(0))?;
        let last_sync_seq = connection.query_row(
            "select last_sync_seq from sync_state where id = 1",
            [],
            |row| row.get(0),
        )?;
        let media_files = count_files(&self.media_dir());
        Ok(StoreStatus {
            path: self.path.display().to_string(),
            schema_version: connection.query_row(
                "select coalesce(max(version), 0) from _local_migrations",
                [],
                |row| row.get(0),
            )?,
            items,
            outbox,
            conflicts,
            last_sync_seq,
            media_files,
        })
    }
}

fn count_files(path: &std::path::Path) -> i64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                count_files(&path)
            } else if path.is_file() {
                1
            } else {
                0
            }
        })
        .sum()
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("jey-store-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn migrates_and_survives_reopen() {
        let dir = temp_dir();
        let store = DesktopStore::open(&dir).expect("open store");
        assert_eq!(store.schema_version().unwrap(), 4);
        assert_eq!(store.status().unwrap().items, 0);

        {
            let connection = store.connection().unwrap();
            connection
                .execute(
                    "insert into items (id, user_id, kind, title, status, created_at, updated_at)
                     values ('i1', 'u1', 'movie', 'Persisted', 'done', 1, 1)",
                    [],
                )
                .unwrap();
        }

        drop(store);
        let reopened = DesktopStore::open(&dir).expect("reopen store");
        assert_eq!(reopened.status().unwrap().items, 1);
        assert_eq!(reopened.last_sync_seq().unwrap(), 0);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn migration_is_idempotent() {
        let store = DesktopStore::in_memory().expect("store");
        store.migrate().unwrap();
        store.migrate().unwrap();
        assert_eq!(store.schema_version().unwrap(), 4);
    }

    #[test]
    fn sync_tables_start_empty() {
        let store = DesktopStore::in_memory().expect("store");
        let status = store.status().unwrap();
        assert_eq!(status.items, 0);
        assert_eq!(status.outbox, 0);
        assert_eq!(status.conflicts, 0);
        assert_eq!(status.last_sync_seq, 0);
    }

    #[test]
    fn migrates_old_schema_and_keeps_a_pre_migration_backup() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        {
            let connection = rusqlite::Connection::open(dir.join("jey.db")).unwrap();
            connection.execute_batch(MIGRATIONS[0].1).unwrap();
            connection
                .execute_batch(
                    "create table _local_migrations (version integer primary key, applied_at integer not null);
                     insert into _local_migrations (version, applied_at) values (1, 1);
                     insert into items (id, user_id, kind, title, status, created_at, updated_at)
                     values ('old-item', 'u1', 'movie', 'Old schema item', 'done', 1, 1);",
                )
                .unwrap();
        }

        let store = DesktopStore::open(&dir).expect("migrate old store");
        assert_eq!(store.schema_version().unwrap(), 4);
        assert_eq!(store.status().unwrap().items, 1);
        let backups = std::fs::read_dir(dir.join("backups"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .count();
        assert_eq!(backups, 1, "pre-migration backup must exist");
        std::fs::remove_dir_all(dir).ok();
    }
    #[test]
    fn migrates_each_old_version_and_keeps_data() {
        for old in 1..4 {
            let dir = temp_dir();
            std::fs::create_dir_all(&dir).unwrap();
            {
                let connection = rusqlite::Connection::open(dir.join("jey.db")).unwrap();
                for (version, sql) in MIGRATIONS.iter().take(old as usize) {
                    connection.execute_batch(sql).unwrap();
                    let _ = version;
                }
                connection
                    .execute_batch(
                        "create table _local_migrations (version integer primary key, applied_at integer not null);",
                    )
                    .unwrap();
                for version in 1..=old {
                    connection
                        .execute(
                            "insert into _local_migrations (version, applied_at) values (?1, 1)",
                            [version],
                        )
                        .unwrap();
                }
                connection
                    .execute(
                        "insert into items (id, user_id, kind, title, status, created_at, updated_at)
                         values ('old-item', 'u1', 'movie', 'Old schema item', 'done', 1, 1)",
                        [],
                    )
                    .unwrap();
            }
            let store = DesktopStore::open(&dir).expect("migrate old store");
            assert_eq!(store.schema_version().unwrap(), 4, "old={old}");
            assert_eq!(store.status().unwrap().items, 1, "old={old}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn copy_to_moves_database_media_and_login() {
        let dir = temp_dir();
        let target = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("access.json"), "access").unwrap();
        std::fs::write(dir.join("session.json"), "session").unwrap();
        std::fs::create_dir_all(dir.join("media")).unwrap();
        std::fs::write(dir.join("media/cover.webp"), "cover").unwrap();
        let store = DesktopStore::open(&dir).expect("store");
        store.copy_to(&target).expect("copy");
        assert!(target.join("access.json").exists());
        assert!(target.join("session.json").exists());
        assert!(target.join("media/cover.webp").exists());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(target).ok();
    }

    #[test]
    fn busy_database_reports_lock_without_corruption() {
        let dir = temp_dir();
        let first = DesktopStore::open(&dir).expect("first store");
        let second = DesktopStore::open(&dir).expect("second store");

        {
            let connection = first.connection().unwrap();
            connection.execute_batch("begin exclusive;").unwrap();
            let other = second.connection().unwrap();
            let result = other.execute(
                "insert into items (id, user_id, kind, title, status, created_at, updated_at)
                 values ('busy-item', 'u1', 'movie', 'Busy', 'done', 1, 1)",
                [],
            );
            assert!(result.is_err(), "second writer must not wait forever");
            connection.execute_batch("rollback;").unwrap();
        }

        let reopened = DesktopStore::open(&dir).expect("database remains readable");
        assert_eq!(reopened.status().unwrap().items, 0);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn damaged_database_is_reported() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("jey.db"), "this is not a sqlite database").unwrap();
        let result = DesktopStore::open(&dir);
        assert!(
            result.is_err(),
            "damaged database must not be silently replaced"
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn read_only_data_folder_is_reported() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let mut permissions = std::fs::metadata(&dir).unwrap().permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o555);
        std::fs::set_permissions(&dir, permissions.clone()).unwrap();
        let result = DesktopStore::open(dir.join("app"));
        let mut restore = std::fs::metadata(&dir).unwrap().permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut restore, 0o755);
        std::fs::set_permissions(&dir, restore).unwrap();
        assert!(result.is_err(), "read-only data folder must be reported");
        std::fs::remove_dir_all(dir).ok();
    }
}
