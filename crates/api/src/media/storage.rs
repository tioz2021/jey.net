//! Local file storage for uploaded media.
//!
//! There is deliberately no trait here: files live on the VPS disk and no
//! second backend is planned. When one appears, this module is the single
//! place to grow the interface.

use std::path::PathBuf;

use uuid::Uuid;

use crate::error::AppError;

/// Public path prefix under which the API serves files (see the media route).
pub const PUBLIC_PREFIX: &str = "/media";

/// Files under one root directory, addressed by keys like
/// `u/{user_id}/{upload_id}/large.webp`.
#[derive(Debug, Clone)]
pub struct LocalStorage {
    root: PathBuf,
    public_prefix: String,
}

impl LocalStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            public_prefix: PUBLIC_PREFIX.to_owned(),
        }
    }

    /// Writes the bytes, replacing a file with the same key.
    pub async fn put(&self, key: &str, bytes: &[u8]) -> Result<(), AppError> {
        let path = self.resolve(key)?;

        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::internal)?;
        }

        tokio::fs::write(&path, bytes)
            .await
            .map_err(AppError::internal)
    }

    /// Reads the file back; `None` when the key does not exist.
    pub async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, AppError> {
        let path = self.resolve(key)?;

        match tokio::fs::read(&path).await {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(AppError::internal(error)),
        }
    }

    /// Removes the file; `false` when there was nothing to remove.
    pub async fn delete(&self, key: &str) -> Result<bool, AppError> {
        let path = self.resolve(key)?;

        match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(AppError::internal(error)),
        }
    }

    /// Public URL path for a stored file.
    pub fn url(&self, key: &str) -> String {
        format!("{}/{}", self.public_prefix.trim_end_matches('/'), key)
    }

    fn resolve(&self, key: &str) -> Result<PathBuf, AppError> {
        validate_key(key)?;

        Ok(self.root.join(key))
    }
}

/// Accepts only relative keys without `..`, so a crafted key can never escape
/// the media root.
pub fn validate_key(key: &str) -> Result<(), AppError> {
    let invalid = || AppError::validation("invalid media key");

    if key.is_empty() || key.starts_with('/') || key.contains("..") {
        return Err(invalid());
    }

    let allowed = key.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '/' | '.' | '-' | '_')
    });

    if !allowed {
        return Err(invalid());
    }

    Ok(())
}

/// Which copy of an upload a key points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Variant {
    /// The bytes exactly as uploaded, keeping the original extension.
    Original,
    /// 1200 px WebP for the record card.
    Large,
    /// 400 px WebP for lists.
    Preview,
}

impl Variant {
    fn file_name(self, original_extension: &str) -> String {
        match self {
            Self::Original => format!("original.{original_extension}"),
            Self::Large => "large.webp".to_owned(),
            Self::Preview => "preview.webp".to_owned(),
        }
    }
}

/// Builds the key for one file: `u/{user_id}/{upload_id}/{variant}`.
pub fn upload_key(
    user_id: Uuid,
    upload_id: Uuid,
    variant: Variant,
    original_extension: &str,
) -> String {
    format!(
        "u/{user_id}/{upload_id}/{}",
        variant.file_name(original_extension)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn storage(name: &str) -> (LocalStorage, PathBuf) {
        let root = std::env::temp_dir().join(format!("jey-storage-{name}-{}", Uuid::new_v4()));
        (LocalStorage::new(&root), root)
    }

    #[tokio::test]
    async fn put_get_and_delete_round_trip() {
        let (storage, root) = storage("round-trip");
        let key = "u/1/2/large.webp";

        storage.put(key, b"hello").await.expect("put");
        assert_eq!(
            storage.get(key).await.expect("get"),
            Some(b"hello".to_vec())
        );

        assert!(storage.delete(key).await.expect("delete"));
        assert_eq!(storage.get(key).await.expect("get"), None);
        assert!(!storage.delete(key).await.expect("delete again"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn writing_the_same_key_replaces_the_file() {
        let (storage, root) = storage("overwrite");

        storage
            .put("u/1/2/original.png", b"first")
            .await
            .expect("put");
        storage
            .put("u/1/2/original.png", b"second")
            .await
            .expect("put");

        assert_eq!(
            storage.get("u/1/2/original.png").await.expect("get"),
            Some(b"second".to_vec())
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn urls_are_built_from_the_prefix() {
        let storage = LocalStorage::new("/tmp/media");
        assert_eq!(storage.url("u/1/2/large.webp"), "/media/u/1/2/large.webp");
    }

    #[test]
    fn keys_cannot_escape_the_root() {
        for key in [
            "../secret",
            "u/../../etc/passwd",
            "/etc/passwd",
            "u/1/2/bad key",
        ] {
            assert!(validate_key(key).is_err(), "accepted: {key}");
        }

        assert!(validate_key("u/1/2/large.webp").is_ok());
    }

    #[test]
    fn keys_follow_the_layout() {
        let user = Uuid::nil();
        let upload = Uuid::nil();

        assert_eq!(
            upload_key(user, upload, Variant::Original, "jpg"),
            "u/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/original.jpg"
        );
        assert!(upload_key(user, upload, Variant::Large, "png").ends_with("large.webp"));
    }
}
