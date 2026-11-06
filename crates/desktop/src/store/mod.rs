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

mod export;
mod repository;
pub use export::{BackupReport, ExportReport, backup, export_json};
pub use repository::SqliteItems;

const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("../../migrations/0001_init.sql"))];

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

    pub fn connection(&self) -> Result<MutexGuard<'_, Connection>, StoreError> {
        self.connection
            .lock()
            .map_err(|_| StoreError::Invalid("database lock poisoned".to_owned()))
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
        })
    }
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
        assert_eq!(store.schema_version().unwrap(), 1);
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
        assert_eq!(store.schema_version().unwrap(), 1);
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
}
