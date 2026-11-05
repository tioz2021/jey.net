//! Append-only audit trail for administrator actions.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

/// Records an action; a logging failure must never fail the action itself.
pub async fn record(
    state: &AppState,
    current: &CurrentUser,
    action: &str,
    target_type: &str,
    target_id: Option<Uuid>,
    target_label: Option<&str>,
    details: Value,
) {
    let _ = sqlx::query(
        "insert into admin_actions
             (admin_id, admin_name, action, target_type, target_id, target_label, details)
         values ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(current.user.id)
    .bind(&current.user.display_name)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(target_label)
    .bind(details)
    .execute(&state.pool)
    .await;
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub offset: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

/// `GET /api/v1/admin/audit?action=...`
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    crate::users::access::require_staff(&state, &current).await?;
    let limit = query.limit.clamp(1, 100);
    let offset = query.offset.max(0);
    let action = query.action.trim();
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
             'id', id,
             'admin_id', admin_id,
             'admin_name', admin_name,
             'action', action,
             'target_type', target_type,
             'target_id', target_id,
             'target_label', target_label,
             'details', details,
             'created_at', created_at
         )
         from admin_actions
         where ($1 = '' or action = $1)
         order by created_at desc
         limit $2 offset $3",
    )
    .bind(action)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let total: i64 =
        sqlx::query_scalar("select count(*) from admin_actions where ($1 = '' or action = $1)")
            .bind(action)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
    Ok(Json(json!({ "actions": rows, "total": total })))
}
