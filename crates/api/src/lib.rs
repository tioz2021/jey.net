//! jey.net API: domain handlers, HTTP router and process helpers.
//!
//! The binary in `main.rs` only wires this library together, which keeps the
//! router importable from integration tests.

pub mod analytics;
pub mod anime;
pub mod audit;
pub mod auth;
pub mod books;
pub mod collections;
pub mod comments;
pub mod config;
pub mod db;
pub mod devices;
pub mod error;
pub mod export;
pub mod fuzzy;
pub mod games;
pub mod http;
pub mod import;
pub mod items;
pub mod mail;
pub mod media;
pub mod movies;
pub mod site;
pub mod stats;
pub mod sync_push;
pub mod system;
pub mod telemetry;
pub mod users;

pub mod push;
pub mod reactions;
pub mod recommendations;
pub mod reports;
