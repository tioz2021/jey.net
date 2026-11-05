//! First-party, cookie-less product analytics.
//!
//! Events contain only an event name, a normalised route and a locale. We never
//! store titles, notes, emails, raw IP addresses or user ids.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

const EVENTS: &[&str] = &[
    "page_view",
    "profile_viewed",
    "public_item_viewed",
    "item_created",
    "search_failed",
    "provider_fallback",
    "registration",
];

#[derive(Debug, Deserialize)]
pub struct EventInput {
    pub name: String,
    pub path: Option<String>,
    pub locale: Option<String>,
}

/// `POST /api/v1/analytics/event` — public, intentionally tiny.
pub async fn event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EventInput>,
) -> Result<StatusCode, AppError> {
    if headers
        .get("dnt")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == "1")
        || headers
            .get("sec-gpc")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value == "1")
    {
        return Ok(StatusCode::NO_CONTENT);
    }
    if !EVENTS.contains(&payload.name.as_str()) {
        return Err(AppError::validation_field(
            "name",
            "unknown analytics event",
        ));
    }
    let path = payload.path.as_deref().map(normalize_path);
    if path.as_deref().is_some_and(|value| value.len() > 120) {
        return Err(AppError::validation_field("path", "path is too long"));
    }
    let locale = payload
        .locale
        .as_deref()
        .filter(|value| value.len() <= 8)
        .map(str::to_owned);
    record(
        &state.pool,
        &payload.name,
        path.as_deref(),
        locale.as_deref(),
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

/// Writes an event; analytics must never break the feature that produced it.
pub async fn record(pool: &sqlx::PgPool, name: &str, path: Option<&str>, locale: Option<&str>) {
    let _ = sqlx::query("insert into analytics_events (name, path, locale) values ($1, $2, $3)")
        .bind(name)
        .bind(path)
        .bind(locale)
        .execute(pool)
        .await;
}

fn normalize_path(path: &str) -> String {
    let path = path.split(['?', '#']).next().unwrap_or("/");
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment.len() >= 16
                && segment
                    .chars()
                    .all(|ch| ch.is_ascii_hexdigit() || ch == '-')
            {
                ":id"
            } else {
                segment
            }
        })
        .collect();
    if segments.is_empty() {
        "/".to_owned()
    } else {
        format!("/{}", segments.join("/"))
    }
}

#[derive(Debug, Deserialize)]
pub struct SummaryQuery {
    #[serde(default = "default_days")]
    pub days: i32,
}

fn default_days() -> i32 {
    30
}

/// `GET /api/v1/analytics/summary` — admin-only funnel and daily series.
pub async fn summary(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<SummaryQuery>,
) -> Result<Json<Value>, AppError> {
    let admin: bool =
        sqlx::query_scalar("select coalesce(is_admin, false) from users where id = $1")
            .bind(current.user.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(AppError::internal)?
            .unwrap_or(false);
    if !admin {
        return Err(AppError::forbidden("admin only"));
    }
    let days = query.days.clamp(7, 90);
    let counts: Value = sqlx::query_scalar(
        "select coalesce(jsonb_object_agg(name, total), '{}'::jsonb)
         from (
             select name, count(*)::bigint as total
             from analytics_events
             where created_at >= now() - make_interval(days => $1)
             group by name
         ) rows",
    )
    .bind(days)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let daily: Value = sqlx::query_scalar(
        "select coalesce(jsonb_agg(jsonb_build_object(
             'date', day::date,
             'views', coalesce(v.views, 0),
             'events', coalesce(v.events, 0)
         ) order by day), '[]'::jsonb)
         from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') day
         left join (
             select date_trunc('day', created_at)::date as day,
                    count(*) filter (where name = 'page_view') as views,
                    count(*) filter (where name <> 'page_view') as events
             from analytics_events
             where created_at >= current_date - ($1::int - 1)
             group by 1
         ) v on v.day = day::date",
    )
    .bind(days)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let paths: Value = sqlx::query_scalar(
        "select coalesce(jsonb_agg(jsonb_build_object('path', path, 'count', total)
             order by total desc), '[]'::jsonb)
         from (
             select coalesce(path, '/') as path, count(*) as total
             from analytics_events
             where name = 'page_view'
               and created_at >= now() - make_interval(days => $1)
             group by 1
             order by total desc
             limit 10
         ) rows",
    )
    .bind(days)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({
        "days": days,
        "counts": counts,
        "daily": daily,
        "paths": paths,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_dynamic_ids() {
        assert_eq!(
            normalize_path("/u/5b234583-5afd-4030-9646-7e2102221a68/items?x=1"),
            "/u/:id/items"
        );
        assert_eq!(normalize_path("/"), "/");
    }
}
