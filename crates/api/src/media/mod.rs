//! Uploaded images: format detection, size limits and local storage.

pub mod quota;
pub mod storage;
pub mod transform;
pub mod upload;

pub use quota::{DEFAULT_QUOTA_MB, ensure_fits, used_bytes};
pub use storage::{LocalStorage, Variant, upload_key};
pub use transform::{ProcessedImage, process};
pub use upload::{ImageFormat, MAX_UPLOAD_BYTES, StoredUpload, detect, save};
