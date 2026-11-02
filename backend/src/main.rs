//! jey.net HTTP API: entry point and process lifecycle.

mod config;
mod error;
mod telemetry;

use std::error::Error;
use std::process::ExitCode;

use axum::{Json, Router, routing::get};
use serde::Serialize;
use tokio::net::TcpListener;
use tracing::info;

use crate::config::Config;
use crate::error::AppError;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        version: VERSION,
    })
}

async fn fallback() -> AppError {
    AppError::not_found("route not found")
}

async fn method_not_allowed() -> AppError {
    AppError::method_not_allowed("method is not allowed for this route")
}

fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed)
}

#[tokio::main]
async fn main() -> ExitCode {
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
        session_ttl_days = config.session_ttl_days,
        allowed_origins = config.allowed_origins.len(),
        database_configured = config.database_url.is_some(),
        "starting jey-api"
    );

    match run(config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("fatal error: {err}");
            ExitCode::FAILURE
        }
    }
}

async fn run(config: Config) -> Result<(), Box<dyn Error>> {
    let listener = TcpListener::bind(config.bind_addr).await?;

    axum::serve(listener, telemetry::instrument(app()))
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
