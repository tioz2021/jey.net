//! HTTP layer: application state, router and service endpoints.

pub mod origin;
pub mod ratelimit;

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;

use crate::auth::login::login;
use crate::auth::logout::logout;
use crate::auth::middleware::require_auth;
use crate::auth::password_change::change_password;
use crate::auth::register::register;
use crate::config::Config;
use crate::db;
use crate::error::AppError;
use crate::http::origin::require_allowed_origin;
use crate::mail::Mailer;
use crate::users::delete::delete_me;
use crate::users::profile::{me, update_me};

/// Version reported by `/health` and the startup log.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Uptime checks usually time out after a few seconds, so never let a slow
/// database keep the readiness call open for the whole pool timeout.
const READINESS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);

/// Everything a handler needs, cheap to clone.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub mailer: Arc<dyn Mailer>,
}

/// Builds the full application router.
pub fn router(state: AppState) -> Router {
    crate::auth::login::warm_up();

    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(readiness))
        .nest("/api/v1", api_v1(state.clone()))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed)
        .with_state(state)
}

fn api_v1(state: AppState) -> Router<AppState> {
    let public = Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout));

    let protected = Router::new()
        .route("/me", get(me).patch(update_me).delete(delete_me))
        .route("/me/password", post(change_password))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    public
        .merge(protected)
        .route_layer(middleware::from_fn_with_state(
            state,
            require_allowed_origin,
        ))
}

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

async fn readiness(State(state): State<AppState>) -> Response {
    let check = tokio::time::timeout(READINESS_TIMEOUT, db::ping(&state.pool)).await;

    match check {
        Ok(Ok(())) => (StatusCode::OK, Json(json!({ "status": "ready" }))).into_response(),
        Ok(Err(err)) => {
            tracing::warn!(error = %err, "readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "unavailable", "reason": "database" })),
            )
                .into_response()
        }
        Err(_) => {
            tracing::warn!("readiness check timed out");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "unavailable", "reason": "timeout" })),
            )
                .into_response()
        }
    }
}

async fn fallback() -> AppError {
    AppError::not_found("route not found")
}

async fn method_not_allowed() -> AppError {
    AppError::method_not_allowed("method is not allowed for this route")
}
