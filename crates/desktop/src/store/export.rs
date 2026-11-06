//! Local JSON export and backup of the SQLite catalogue plus cached media.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use uuid::Uuid;

use super::{DesktopStore, SqliteItems, StoreError};

#[derive(Debug, Serialize)]
pub struct ExportReport {
    pub path: String,
    pub items: usize,
    pub collections: usize,
}

#[derive(Debug, Serialize)]
pub struct BackupReport {
    pub path: String,
    pub items: usize,
    pub collections: usize,
    pub db_bytes: u64,
    pub media_files: usize,
}

#[derive(Debug, Serialize)]
struct ExportFile<'a> {
    version: u8,
    exported_at: i64,
    user_id: Uuid,
    items: &'a [jey_core::items::Item],
    collections: &'a [serde_json::Value],
}

#[derive(Debug, Serialize)]
struct BackupManifest {
    version: u8,
    created_at: i64,
    user_id: Uuid,
    items: usize,
    collections: usize,
    db_bytes: u64,
    media_files: usize,
}

fn stamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Writes a portable JSON export under `<app data>/exports`.
pub fn export_json(store: &DesktopStore, user_id: Uuid) -> Result<ExportReport, StoreError> {
    let items = SqliteItems::new(store.clone())
        .all_items(user_id)
        .map_err(|error| StoreError::Invalid(error.to_string()))?;
    let collections = SqliteItems::new(store.clone())
        .export_collections(user_id)
        .map_err(|error| StoreError::Invalid(error.to_string()))?;
    let data_dir = store.path().parent().unwrap_or_else(|| Path::new("."));
    let dir = data_dir.join("exports");
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("jey-library-{}.json", stamp()));
    let file = ExportFile {
        version: 1,
        exported_at: stamp(),
        user_id,
        items: &items,
        collections: &collections,
    };
    let raw =
        serde_json::to_vec_pretty(&file).map_err(|error| StoreError::Invalid(error.to_string()))?;
    fs::write(&path, raw)?;
    Ok(ExportReport {
        path: path.display().to_string(),
        items: items.len(),
        collections: collections.len(),
    })
}

/// Creates a consistent database copy and copies cached media.
pub fn backup(store: &DesktopStore, user_id: Uuid) -> Result<BackupReport, StoreError> {
    let data_dir = store.path().parent().unwrap_or_else(|| Path::new("."));
    let backup_dir = data_dir.join("backups").join(stamp().to_string());
    fs::create_dir_all(&backup_dir)?;

    let db_copy = backup_dir.join("jey.db");
    {
        let connection = store.connection()?;
        // VACUUM INTO produces a compact copy without WAL side files.
        connection
            .execute("VACUUM INTO ?1", [db_copy.to_string_lossy().as_ref()])
            .map_err(StoreError::Sql)?;
    }

    let media_source = data_dir.join("media");
    let media_target = backup_dir.join("media");
    let media_files = if media_source.is_dir() {
        copy_dir(&media_source, &media_target)?
    } else {
        0
    };

    let items = SqliteItems::new(store.clone())
        .all_items(user_id)
        .map_err(|error| StoreError::Invalid(error.to_string()))?;
    let collections = SqliteItems::new(store.clone())
        .export_collections(user_id)
        .map_err(|error| StoreError::Invalid(error.to_string()))?;
    let db_bytes = fs::metadata(&db_copy)?.len();
    let manifest = BackupManifest {
        version: 1,
        created_at: stamp(),
        user_id,
        items: items.len(),
        collections: collections.len(),
        db_bytes,
        media_files,
    };
    fs::write(
        backup_dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|error| StoreError::Invalid(error.to_string()))?,
    )?;

    Ok(BackupReport {
        path: backup_dir.display().to_string(),
        items: items.len(),
        collections: collections.len(),
        db_bytes,
        media_files,
    })
}

fn copy_dir(source: &Path, target: &Path) -> Result<usize, StoreError> {
    fs::create_dir_all(target)?;
    let mut count = 0;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            count += copy_dir(&path, &destination)?;
        } else if path.is_file() {
            fs::copy(&path, &destination)?;
            count += 1;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::DesktopStore;
    use jey_core::items::{ItemKind, ItemStatus, NewItem};
    use jey_core::repositories::ItemRepository;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("jey-export-{}", Uuid::new_v4()))
    }

    fn item() -> NewItem {
        NewItem {
            kind: ItemKind::Movie,
            title: "Export me".to_owned(),
            subtitle: None,
            year: Some(2025),
            status: ItemStatus::Done,
            rating: Some(9),
            review: Some("good".to_owned()),
            body: Some("private".to_owned()),
            source_url: None,
            external_source: None,
            external_id: None,
            details: None,
            public_hidden: false,
        }
    }

    #[tokio::test]
    async fn exports_live_items_as_json() {
        let dir = temp_dir();
        let store = DesktopStore::open(&dir).expect("store");
        let repo = SqliteItems::new(store.clone());
        let user = Uuid::new_v4();
        repo.create_item(user, None, &item()).await.unwrap();

        let report = export_json(&store, user).expect("export");
        assert_eq!(report.items, 1);
        let raw = fs::read_to_string(&report.path).unwrap();
        assert!(raw.contains("Export me"));
        assert!(raw.contains("private"));
        fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn backup_copies_a_readable_database_and_media() {
        let dir = temp_dir();
        let store = DesktopStore::open(&dir).expect("store");
        let repo = SqliteItems::new(store.clone());
        let user = Uuid::new_v4();
        repo.create_item(user, None, &item()).await.unwrap();
        fs::create_dir_all(dir.join("media")).unwrap();
        fs::write(dir.join("media").join("cover.webp"), b"cover").unwrap();

        let report = backup(&store, user).expect("backup");
        assert_eq!(report.items, 1);
        assert_eq!(report.media_files, 1);
        let copy =
            rusqlite::Connection::open(Path::new(&report.path).join("jey.db")).expect("backup db");
        let count: i64 = copy
            .query_row("select count(*) from items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert!(Path::new(&report.path).join("media/cover.webp").exists());
        assert!(Path::new(&report.path).join("manifest.json").exists());
        fs::remove_dir_all(dir).ok();
    }
}
