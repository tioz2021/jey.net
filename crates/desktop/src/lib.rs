//! Shared desktop crate.
//!
//! The GUI is feature-gated so the workspace still builds on machines without
//! WebKitGTK/GTK development headers. Release builds enable `--features tauri`.

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod access;
pub mod session_store;
pub mod store;
pub mod sync;

#[cfg(feature = "tauri")]
pub mod shell;

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_not_empty() {
        assert!(!super::APP_VERSION.is_empty());
    }
}
