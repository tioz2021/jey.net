//! jey.net HTTP API: entry point and process lifecycle.

mod auth;
mod config;
mod db;
mod error;
mod http;
mod telemetry;

use std::error::Error;
use std::process::ExitCode;
use std::sync::Arc;

use sqlx::PgPool;
use tokio::net::TcpListener;
use tracing::{info, warn};

use crate::config::Config;
use crate::http::{AppState, VERSION, router};

#[tokio::main]
async fn main() -> ExitCode {
    let command = match parse_command() {
        Ok(command) => command,
        Err(message) => {
            eprintln!("{message}");
            return ExitCode::FAILURE;
        }
    };

    let config = match Config::load() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("configuration error: {err}");
            return ExitCode::FAILURE;
        }
    };

    telemetry::init(&config);

    info!(
        env = %config.app_env,
        address = %config.bind_addr,
        version = VERSION,
        run_migrations = config.run_migrations,
        session_ttl_days = config.session_ttl_days,
        allowed_origins = config.allowed_origins.len(),
        "starting jey-api"
    );

    let pool = match db::create_pool(&config) {
        Ok(pool) => pool,
        Err(err) => {
            eprintln!("database configuration error: {err}");
            return ExitCode::FAILURE;
        }
    };

    if command == Command::Migrate {
        return migrate_and_exit(&pool).await;
    }

    if config.run_migrations {
        match db::migrate(&pool).await {
            Ok(()) => info!("migrations applied"),
            Err(err) => {
                eprintln!("migration failed: {err}");
                return ExitCode::FAILURE;
            }
        }
    }

    match tokio::time::timeout(std::time::Duration::from_secs(1), db::ping(&pool)).await {
        Ok(Ok(())) => info!("database connection established"),
        Ok(Err(err)) => warn!(error = %err, "database is not reachable yet"),
        Err(_) => warn!("database connection attempt timed out"),
    }

    match run(config, pool).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("fatal error: {err}");
            ExitCode::FAILURE
        }
    }
}

/// What the process should do after loading its configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Command {
    Serve,
    Migrate,
}

fn parse_command() -> Result<Command, String> {
    match std::env::args().nth(1).as_deref() {
        None => Ok(Command::Serve),
        Some("migrate") => Ok(Command::Migrate),
        Some(other) => Err(format!(
            "unknown command {other:?}; supported commands: migrate"
        )),
    }
}

async fn migrate_and_exit(pool: &PgPool) -> ExitCode {
    match db::migrate(pool).await {
        Ok(()) => {
            println!("migrations applied");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("migration failed: {err}");
            ExitCode::FAILURE
        }
    }
}

async fn run(config: Config, pool: PgPool) -> Result<(), Box<dyn Error>> {
    let listener = TcpListener::bind(config.bind_addr).await?;
    let state = AppState {
        pool,
        config: Arc::new(config),
    };

    axum::serve(listener, telemetry::instrument(router(state)))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install ctrl+c handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    info!("shutdown signal received");
}
