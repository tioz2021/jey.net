//! jey.net API: domain handlers, HTTP router and process helpers.
//!
//! The binary in `main.rs` only wires this library together, which keeps the
//! router importable from integration tests.

pub mod anime;
pub mod auth;
pub mod books;
pub mod config;
pub mod db;
pub mod error;
pub mod export;
pub mod games;
pub mod http;
pub mod import;
pub mod items;
pub mod mail;
pub mod media;
pub mod movies;
pub mod stats;
pub mod telemetry;
pub mod users;
