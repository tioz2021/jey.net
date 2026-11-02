//! Domain model and rules shared by the API server and the desktop client.
//!
//! This crate describes what the application means, not how it is transported
//! or stored: it must not depend on `axum` or `sqlx`.

pub mod error;
pub mod sync;

pub use error::DomainError;
