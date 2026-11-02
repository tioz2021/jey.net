//! Image uploads: the format is decided by the bytes, never by the name.

use std::path::Path;

use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;
use crate::media::transform;

/// Largest accepted file.
pub const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
    WebP,
}

impl ImageFormat {
    pub const fn mime(self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::WebP => "image/webp",
        }
    }

    pub const fn extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::WebP => "webp",
        }
    }
}

/// Sniffs the format from the first bytes of the file.
///
/// A text file renamed to `.jpg` has no image signature and is rejected.
pub fn detect(bytes: &[u8]) -> Option<ImageFormat> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(ImageFormat::Jpeg);
    }

    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(ImageFormat::Png);
    }

    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(ImageFormat::WebP);
    }

    None
}

/// A file that has been checked and written to storage.
#[derive(Debug)]
pub struct StoredUpload {
    pub id: Uuid,
    pub mime: &'static str,
    pub storage_key: String,
    pub sha256: Vec<u8>,
    pub size: i64,
    pub width: u32,
    pub height: u32,
    pub large_key: String,
    pub preview_key: String,
}

/// Validates the bytes and writes them under the media root.
pub async fn save(media_dir: &Path, user_id: Uuid, bytes: &[u8]) -> Result<StoredUpload, AppError> {
    if bytes.is_empty() {
        return Err(AppError::validation_field("file", "file is empty"));
    }

    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(AppError::payload_too_large(format!(
            "file must be at most {} MB",
            MAX_UPLOAD_BYTES / (1024 * 1024)
        )));
    }

    let format = detect(bytes).ok_or_else(|| {
        AppError::unsupported_media_type("only JPEG, PNG and WebP images are accepted")
    })?;

    // Decoding also rejects files that pass the signature check but are broken.
    let processed = transform::process(bytes)?;

    let id = Uuid::new_v4();
    let storage_key = format!("{user_id}/{id}.{}", format.extension());
    let large_key = format!("{user_id}/{id}_large.webp");
    let preview_key = format!("{user_id}/{id}_preview.webp");

    if let Some(parent) = media_dir.join(&storage_key).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(AppError::internal)?;
    }

    for (key, contents) in [
        (&storage_key, bytes),
        (&large_key, processed.large.as_slice()),
        (&preview_key, processed.preview.as_slice()),
    ] {
        tokio::fs::write(media_dir.join(key), contents)
            .await
            .map_err(AppError::internal)?;
    }

    let mut hasher = Sha256::new();
    hasher.update(bytes);

    Ok(StoredUpload {
        id,
        mime: format.mime(),
        storage_key,
        sha256: hasher.finalize().to_vec(),
        size: bytes.len() as i64,
        width: processed.width,
        height: processed.height,
        large_key,
        preview_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_the_three_supported_formats() {
        assert_eq!(detect(&[0xFF, 0xD8, 0xFF, 0xE0]), Some(ImageFormat::Jpeg));
        assert_eq!(
            detect(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00]),
            Some(ImageFormat::Png)
        );
        assert_eq!(
            detect(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
            Some(ImageFormat::WebP)
        );
    }

    #[test]
    fn rejects_text_even_if_it_looks_like_a_name() {
        assert_eq!(detect(b"hello, I am not an image"), None);
        assert_eq!(detect(&[]), None);
        assert_eq!(detect(b"GIF89a"), None);
    }
}
