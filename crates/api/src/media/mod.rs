//! Uploaded images: format detection, size limits and local storage.

pub mod transform;
pub mod upload;

pub use transform::{ProcessedImage, process};
pub use upload::{ImageFormat, MAX_UPLOAD_BYTES, StoredUpload, detect, save};
