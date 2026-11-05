//! Admin system status: services, disk, memory, migrations and backups.

use std::process::Stdio;
use std::time::Duration;

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::process::Command;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

async fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = tokio::time::timeout(
        Duration::from_secs(2),
        Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

async fn service(name: &str) -> &'static str {
    match command_output("systemctl", &["is-active", name])
        .await
        .as_deref()
    {
        Some("active") => "ok",
        Some(_) => "down",
        None => "unknown",
    }
}

fn memory() -> (u64, u64) {
    let Ok(raw) = std::fs::read_to_string("/proc/meminfo") else {
        return (0, 0);
    };
    let value = |key: &str| {
        raw.lines()
            .find(|line| line.starts_with(key))
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0)
            * 1024
    };
    (value("MemTotal:"), value("MemAvailable:"))
}

async fn disk() -> (u64, u64) {
    let Some(output) = command_output("df", &["-Pk", "/"]).await else {
        return (0, 0);
    };
    let Some(line) = output.lines().nth(1) else {
        return (0, 0);
    };
    let fields: Vec<&str> = line.split_whitespace().collect();
    let total = fields
        .get(1)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        * 1024;
    let used = fields
        .get(2)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        * 1024;
    (total, used)
}

/// `GET /api/v1/admin/system`
pub async fn status(
    State(state): State<AppState>,
    current: CurrentUser,
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
    let (api, web, caddy, postgres) = tokio::join!(
        service("jey-api"),
        service("jey-web"),
        service("caddy"),
        service("postgresql@18-main"),
    );
    let (disk_total, disk_used) = disk().await;
    let (mem_total, mem_available) = memory();
    let migrations: Value = sqlx::query_scalar(
        "select jsonb_build_object(
             'count', count(*),
             'latest', max(version),
             'installed_at', max(installed_on)
         ) from _sqlx_migrations",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let errors_24h: i64 = sqlx::query_scalar(
        "select count(*) from system_errors where created_at > now() - interval '24 hours'",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let backup: Value = std::fs::read_to_string("/var/lib/jey/backup-status.json")
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({ "ok": false, "missing": true }));
    let deploy_at = std::fs::metadata("/opt/jey/jey-api")
        .and_then(|metadata| metadata.modified())
        .ok()
        .map(chrono::DateTime::<chrono::Utc>::from)
        .map(|time| time.to_rfc3339());
    Ok(Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "services": { "api": api, "web": web, "caddy": caddy, "postgres": postgres },
        "disk": { "total": disk_total, "used": disk_used },
        "memory": { "total": mem_total, "available": mem_available },
        "migrations": migrations,
        "errors_24h": errors_24h,
        "backup": backup,
        "last_deploy_at": deploy_at,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ErrorsQuery {
    #[serde(default = "default_days")]
    pub days: i64,
}

fn default_days() -> i64 {
    7
}

/// `GET /api/v1/admin/errors` — grouped 5xx journal.
pub async fn errors(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<ErrorsQuery>,
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
    let days = query.days.clamp(1, 90);
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
             'path', path,
             'status', status,
             'count', count(*),
             'first_seen', min(created_at),
             'last_seen', max(created_at),
             'last_request_id', (array_agg(request_id order by created_at desc))[1]
         )
         from system_errors
         where created_at > now() - make_interval(days => $1)
         group by path, status
         order by max(created_at) desc
         limit 100",
    )
    .bind(days)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let total: i64 = sqlx::query_scalar(
        "select count(*) from system_errors where created_at > now() - make_interval(days => $1)",
    )
    .bind(days)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(
        json!({ "errors": rows, "total": total, "days": days }),
    ))
}
