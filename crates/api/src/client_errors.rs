//! Structured browser error reports (T200).
//!
//! The client sends only a route, scope, message/stack and build metadata.
//! Request bodies, cookies and auth tokens never reach this table.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;

use crate::auth::middleware::CurrentUser;
use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct ClientErrorInput {
    pub route: String,
    pub scope: String,
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
    #[serde(default)]
    pub app_version: Option<String>,
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ClientErrorAccepted {
    pub accepted: bool,
}

fn cut(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn scrub(value: &str) -> String {
    let mut parts = Vec::new();
    for word in value.split_whitespace() {
        let lowered = word.to_ascii_lowercase();
        if lowered.starts_with("bearer")
            || lowered.contains("access_token")
            || lowered.contains("password")
            || lowered.contains("authorization:")
            || word.len() > 120
                && word.chars().any(|ch| ch.is_ascii_digit())
                && word.matches('.').count() >= 2
        {
            parts.push("[redacted]");
        } else {
            parts.push(word);
        }
    }
    parts.join(" ")
}

/// `POST /api/v1/client-errors`
pub async fn report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ClientErrorInput>,
) -> Result<(axum::http::StatusCode, Json<ClientErrorAccepted>), AppError> {
    let route = cut(&input.route, 200);
    let scope = cut(&input.scope, 64);
    let message = cut(&scrub(&input.message), 1000);
    let stack = input.stack.as_deref().map(|value| cut(&scrub(value), 4000));
    let app_version = cut(input.app_version.as_deref().unwrap_or("web"), 32);
    let request_id = input.request_id.as_deref().map(|value| cut(value, 64));
    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .map(|value| cut(value, 300));
    let user_id = session::authenticate(&state.pool, &headers)
        .await
        .ok()
        .map(|session| session.user.id);

    sqlx::query(
        "insert into client_errors
            (user_id, route, scope, message, stack, app_version, request_id, user_agent)
         values ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(user_id)
    .bind(route)
    .bind(scope)
    .bind(message)
    .bind(stack)
    .bind(app_version)
    .bind(request_id)
    .bind(user_agent)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok((
        axum::http::StatusCode::ACCEPTED,
        Json(ClientErrorAccepted { accepted: true }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct ErrorsQuery {
    #[serde(default = "default_days")]
    pub days: i64,
}

fn default_days() -> i64 {
    7
}

/// `GET /api/v1/admin/client-errors`
pub async fn admin_list(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<ErrorsQuery>,
) -> Result<Json<Value>, AppError> {
    crate::users::access::require_staff(&state, &current).await?;
    let days = query.days.clamp(1, 90);
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
             'route', route, 'scope', scope, 'message', message,
             'count', count(*), 'first_seen', min(created_at),
             'last_seen', max(created_at), 'last_version', (array_agg(app_version order by created_at desc))[1],
             'last_request_id', (array_agg(request_id order by created_at desc))[1]
         )
         from client_errors
         where created_at > now() - make_interval(days => $1::int)
         group by route, scope, message
         order by max(created_at) desc
         limit 100",
    )
    .bind(days)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "errors": rows, "days": days })))
}
