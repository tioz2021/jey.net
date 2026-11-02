//! Uploaded images: format detection, size limits and local storage.

pub mod upload;

pub use upload::{ImageFormat, MAX_UPLOAD_BYTES, StoredUpload, detect, save};
