//! `jey-gc`: removes media files nothing references any more.
//!
//! Safe to run on a schedule: it never touches files younger than a day and
//! repeating it changes nothing.

use std::process::ExitCode;

use jey_api::config::Config;
use jey_api::db;
use jey_api::media::{LocalStorage, gc};

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("gc failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load()?;
    let pool = db::create_pool(&config)?;
    let storage = LocalStorage::new(config.media_dir.clone());

    let report = gc::run(&pool, &storage, &config.media_dir).await?;

    println!(
        "removed {} uploads and {} files, freed {} bytes",
        report.uploads_deleted, report.files_deleted, report.bytes_freed
    );

    Ok(())
}
