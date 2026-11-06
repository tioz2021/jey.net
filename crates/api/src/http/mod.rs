//! HTTP layer: application state, router and service endpoints.

pub mod media;
pub mod origin;
pub mod ratelimit;
mod uploads;

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::extract::State;
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;

use crate::auth::email_verify::{resend_verification, verify_email};
use crate::auth::login::login;
use crate::auth::logout::{logout, revoke_all_sessions};
use crate::auth::middleware::require_auth;
use crate::auth::password_change::change_password;
use crate::auth::password_reset::{confirm_reset, request_reset};
use crate::auth::register::register;
use crate::config::Config;
use crate::db;
use crate::error::AppError;
use crate::export::export;
use crate::http::media::serve_media;
use crate::http::origin::require_allowed_origin;
use crate::http::uploads::upload;
use crate::import::import;
use crate::items::cover::{clear_cover, set_cover};
use crate::items::create::create_item;
use crate::items::delete::{delete_item, empty_trash, purge_item, restore_item};
use crate::items::get::get_item;
use crate::items::list::list_items;
use crate::items::update::update_item;
use crate::mail::Mailer;
use crate::media::LocalStorage;
use crate::stats::stats;
use crate::users::avatar::{clear_avatar, set_avatar};
use crate::users::banner::{clear_banner, set_banner};
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
    pub storage: Arc<LocalStorage>,
    pub tmdb: Arc<crate::movies::tmdb::TmdbClient>,
    pub igdb: Arc<crate::games::igdb::IgdbClient>,
    pub anime: Arc<crate::anime::AnimeClient>,
    pub books: Arc<crate::books::BookClient>,
    pub recommendations: Arc<crate::recommendations::RecommendationCache>,
}

/// Builds the full application router.
pub fn router(state: AppState) -> Router {
    crate::auth::login::warm_up();

    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(readiness))
        // Media is public route-wise: the handler checks ownership itself.
        .route("/media/{*key}", get(serve_media))
        .nest("/api/v1", api_v1(state.clone()))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed)
        .with_state(state)
}

async fn track_errors(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: middleware::Next,
) -> Response {
    let raw_path = request.uri().path();
    let full_path = if raw_path.starts_with("/api/v1") {
        raw_path.to_owned()
    } else {
        format!("/api/v1{raw_path}")
    };
    let path = crate::analytics::normalize_path(&full_path);
    let request_id = crate::telemetry::current_request_id();
    let response = next.run(request).await;
    if response.status().is_server_error() {
        let status = response.status().as_u16() as i16;
        let _ =
            sqlx::query("insert into system_errors (path, status, request_id) values ($1, $2, $3)")
                .bind(&path)
                .bind(status)
                .bind(&request_id)
                .execute(&state.pool)
                .await;
    }
    response
}

fn api_v1(state: AppState) -> Router<AppState> {
    let public = Router::new()
        // Same liveness probe as /health, exposed under the versioned prefix
        // for clients that only talk to /api/v1.
        .route("/health", get(health))
        // Opt-in public profiles; private accounts answer 404 like missing ones.
        .route("/public/users", get(crate::users::public::list))
        .route("/public/users/{id}", get(crate::users::public::profile))
        .route(
            "/public/users/{id}/collections/{slug}",
            get(crate::collections::public_detail),
        )
        .route("/public/cart/{slug}", get(crate::users::public::by_slug))
        .route(
            "/public/users/{id}/items/by-slug/{slug}",
            get(crate::users::public::by_slug_for_user),
        )
        .route(
            "/public/users/{id}/items/{item_id}",
            get(crate::users::public::item),
        )
        .route("/push/key", get(crate::push::public_key))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/google/start", get(crate::auth::google::start))
        .route("/auth/google/callback", get(crate::auth::google::callback))
        // Public: TMDB posters and actor portraits are not private data, and
        // guest profiles must render them too.
        .route("/movies/image", get(crate::movies::image))
        .route("/books/image", get(crate::books::image))
        .route("/games/image", get(crate::games::image))
        .route("/anime/image", get(crate::anime::image))
        .route(
            "/public/users/{id}/items/{item_id}/episodes",
            get(crate::users::public::episodes),
        )
        .route(
            "/public/items/{id}/similar",
            get(crate::recommendations::public_similar),
        )
        .route("/public/items/{id}/reactions", get(crate::reactions::list))
        .route(
            "/public/users/{id}/items/{item_id}/comments",
            get(crate::comments::list),
        )
        .route("/auth/logout", post(logout))
        .route("/auth/verify-email", post(verify_email))
        .route("/auth/password-reset/request", post(request_reset))
        .route("/auth/password-reset/confirm", post(confirm_reset))
        .route("/analytics/event", post(crate::analytics::event))
        .route("/site/status", get(crate::site::public_status));

    let protected = Router::new()
        .route("/me", get(me).patch(update_me).delete(delete_me))
        .route("/me/profile", get(crate::users::public::own_profile))
        .route("/me/password", post(change_password))
        .route("/feed", get(crate::users::follows::feed))
        .route("/blocks", get(crate::users::follows::blocked))
        .route(
            "/public/users/{id}/items/{item_id}/comments",
            post(crate::comments::create),
        )
        .route(
            "/comments/{id}",
            axum::routing::delete(crate::comments::remove),
        )
        .route(
            "/comments/{id}/reaction",
            post(crate::comments::toggle_reaction),
        )
        .route(
            "/public/items/{id}/reactions",
            post(crate::reactions::toggle),
        )
        .route("/notifications", get(crate::users::notifications::list))
        .route(
            "/push/subscribe",
            post(crate::push::subscribe).delete(crate::push::unsubscribe),
        )
        .route(
            "/collections",
            get(crate::collections::list).post(crate::collections::create),
        )
        .route("/devices", post(crate::devices::register))
        .route(
            "/sync/push",
            post(crate::sync_push::push).layer(axum::extract::DefaultBodyLimit::max(1024 * 1024)),
        )
        .route(
            "/collections/for-item/{item_id}",
            get(crate::collections::for_item),
        )
        .route(
            "/collections/{id}",
            get(crate::collections::detail)
                .patch(crate::collections::update)
                .delete(crate::collections::remove),
        )
        .route(
            "/collections/{id}/items/{item_id}",
            axum::routing::put(crate::collections::add_item)
                .delete(crate::collections::remove_item),
        )
        .route(
            "/reports",
            get(crate::reports::list).post(crate::reports::create),
        )
        .route(
            "/reports/{id}",
            axum::routing::patch(crate::reports::resolve),
        )
        .route(
            "/notifications/settings",
            get(crate::users::notifications::get_settings)
                .patch(crate::users::notifications::update_settings),
        )
        .route(
            "/notifications/read",
            post(crate::users::notifications::mark_all_read),
        )
        .route(
            "/notifications/{id}/read",
            post(crate::users::notifications::mark_read),
        )
        .route(
            "/recommendations/friends",
            get(crate::recommendations::friends),
        )
        .route("/recommendations/taste", get(crate::recommendations::taste))
        .route("/items/{id}/similar", get(crate::recommendations::similar))
        .route("/follows/following", get(crate::users::follows::following))
        .route(
            "/users/{id}/follow/notifications",
            axum::routing::patch(crate::users::follows::notifications),
        )
        .route(
            "/users/{id}/follow",
            get(crate::users::follows::status)
                .post(crate::users::follows::follow)
                .delete(crate::users::follows::unfollow),
        )
        .route(
            "/users/{id}/block",
            post(crate::users::follows::block).delete(crate::users::follows::unblock),
        )
        .route("/me/sessions/revoke-all", post(revoke_all_sessions))
        .route("/me/avatar", post(set_avatar).delete(clear_avatar))
        .route("/me/banner", post(set_banner).delete(clear_banner))
        // A generous transport limit: the exact 10 MB rule lives in the
        // handler, so an oversized image gets a JSON 413 instead of a plain
        // text rejection from the body extractor.
        .route(
            "/uploads",
            post(upload).layer(DefaultBodyLimit::max(16 * 1024 * 1024)),
        )
        .route("/auth/verify-email/resend", post(resend_verification))
        .route("/movies/search", get(crate::movies::search))
        .route("/movies/{id}", get(crate::movies::details))
        .route("/tv/search", get(crate::movies::tv_search))
        .route("/tv/{id}", get(crate::movies::tv_details))
        .route("/books/search", get(crate::books::search))
        .route("/books/{id}", get(crate::books::details))
        .route("/games/search", get(crate::games::search))
        .route("/games/{id}", get(crate::games::details))
        .route("/anime/search", get(crate::anime::search))
        .route("/anime/{id}", get(crate::anime::details))
        .route("/items", post(create_item).get(list_items))
        .route("/items/ids", get(crate::items::list::list_ids))
        .route("/items/by-slug/{slug}", get(crate::items::get::get_by_slug))
        .route("/items/{id}/neighbors", get(crate::items::list::neighbors))
        .route(
            "/items/{id}",
            get(get_item).patch(update_item).delete(delete_item),
        )
        .route("/items/{id}/restore", post(restore_item))
        .route("/items/{id}/purge", delete(purge_item))
        .route("/trash", delete(empty_trash))
        .route("/items/{id}/cover", post(set_cover).delete(clear_cover))
        .route(
            "/items/{id}/poster",
            post(crate::items::cover::set_tmdb_poster),
        )
        .route("/items/{id}/refresh", post(crate::items::refresh::refresh))
        .route("/items/{id}/episodes", get(crate::items::episodes::season))
        .route(
            "/items/{id}/episodes/{season}",
            post(crate::items::episodes::toggle_season),
        )
        .route(
            "/items/{id}/episodes/{season}/{episode}",
            post(crate::items::episodes::toggle),
        )
        .route("/stats", get(stats))
        .route("/analytics/summary", get(crate::analytics::summary))
        .route("/analytics/audience", get(crate::analytics::audience))
        .route("/me/presence", post(crate::analytics::presence))
        .route("/admin/users", get(crate::users::admin::list))
        .route("/admin/audit", get(crate::audit::list))
        .route("/admin/system", get(crate::system::status))
        .route(
            "/admin/site",
            get(crate::site::get_admin).patch(crate::site::update),
        )
        .route("/admin/errors", get(crate::system::errors))
        .route(
            "/admin/users/{id}/sessions/revoke",
            post(crate::users::admin::revoke_sessions),
        )
        .route(
            "/admin/users/{id}/suspension",
            axum::routing::patch(crate::users::admin::suspend),
        )
        .route(
            "/admin/users/{id}/admin",
            axum::routing::patch(crate::users::admin::set_admin),
        )
        .route(
            "/admin/users/{id}/test",
            axum::routing::patch(crate::users::admin::set_test),
        )
        .route(
            "/admin/users/{id}/role",
            axum::routing::patch(crate::users::admin::set_role),
        )
        .route(
            "/admin/test-data/purge",
            post(crate::users::admin::purge_test_data),
        )
        .route(
            "/admin/users/{id}",
            axum::routing::delete(crate::users::admin::delete),
        )
        .route("/export", get(export))
        .route(
            "/import",
            post(import).layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    public
        .merge(protected)
        .layer(middleware::from_fn_with_state(state.clone(), track_errors))
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
