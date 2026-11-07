//! Local media cache. Keys are validated by the server; the desktop repeats
//! the check before touching the filesystem.

use std::fs;
use std::path::PathBuf;

use super::{DesktopStore, StoreError};

impl DesktopStore {
    pub fn media_dir(&self) -> PathBuf {
        self.path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("media")
    }

    pub fn media_path(&self, key: &str) -> Result<PathBuf, StoreError> {
        validate_key(key)?;
        Ok(self.media_dir().join(key))
    }

    pub fn media_cached(&self, key: &str) -> Result<bool, StoreError> {
        Ok(self.media_path(key)?.is_file())
    }

    pub fn write_media(&self, key: &str, bytes: &[u8]) -> Result<(), StoreError> {
        let path = self.media_path(key)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, bytes)?;
        Ok(())
    }

    pub fn read_media(&self, key: &str) -> Result<Option<Vec<u8>>, StoreError> {
        let path = self.media_path(key)?;
        match fs::read(path) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(StoreError::Io(error)),
        }
    }

    pub fn cover_keys(&self, user_id: uuid::Uuid) -> Result<Vec<String>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select distinct cover_key from items
             where user_id = ?1 and cover_key is not null and deleted_at is null",
        )?;
        let rows = statement.query_map([user_id.to_string()], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }
}

fn validate_key(key: &str) -> Result<(), StoreError> {
    if key.is_empty()
        || key.starts_with('/')
        || key.contains("..")
        || !key.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '/' | '.' | '-' | '_')
        })
    {
        return Err(StoreError::Invalid("invalid media key".to_owned()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn writes_and_reads_a_media_file() {
        let dir = std::env::temp_dir().join(format!("jey-media-{}", Uuid::new_v4()));
        let store = DesktopStore::open(&dir).expect("store");
        let key = "u/00000000-0000-0000-0000-000000000001/abc/large.webp";
        assert!(!store.media_cached(key).unwrap());
        store.write_media(key, b"image").unwrap();
        assert!(store.media_cached(key).unwrap());
        assert_eq!(
            store.read_media(key).unwrap().as_deref(),
            Some(b"image".as_slice())
        );
        assert!(store.media_path("../escape").is_err());
        std::fs::remove_dir_all(dir).ok();
    }
}
