//! Conflict copies for collections and comments.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct ResolveRequest {
    pub keep: String,
}

/// Stores a social conflict unless the exact incoming version is already
/// pending. Returns the conflict id.
pub async fn record(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    entity: &str,
    entity_id: Uuid,
    incoming: &Value,
    stored: &Value,
) -> Result<Uuid, AppError> {
    let existing: Option<Uuid> = sqlx::query_scalar(
        "select id from social_conflicts
         where user_id = $1 and entity = $2 and entity_id = $3
           and incoming = $4 and resolved_at is null
         limit 1",
    )
    .bind(user_id)
    .bind(entity)
    .bind(entity_id)
    .bind(incoming)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    if let Some(id) = existing {
        return Ok(id);
    }
    let id: Uuid = sqlx::query_scalar(
        "insert into social_conflicts (user_id, entity, entity_id, incoming, stored)
         values ($1, $2, $3, $4, $5) returning id",
    )
    .bind(user_id)
    .bind(entity)
    .bind(entity_id)
    .bind(incoming)
    .bind(stored)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    Ok(id)
}

pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let conflicts: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'conflict_id', id, 'entity', entity, 'entity_id', entity_id,
            'incoming', incoming, 'stored', stored, 'created_at', created_at)
         from social_conflicts
         where user_id = $1 and resolved_at is null
         order by created_at asc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "conflicts": conflicts })))
}

pub async fn resolve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(conflict_id): Path<Uuid>,
    Json(request): Json<ResolveRequest>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    if request.keep != "incoming" && request.keep != "stored" {
        return Err(AppError::validation_field(
            "keep",
            "keep must be incoming or stored",
        ));
    }
    let row: Option<(String, Uuid, Value)> = sqlx::query_as(
        "select entity, entity_id, incoming
         from social_conflicts
         where id = $1 and user_id = $2 and resolved_at is null",
    )
    .bind(conflict_id)
    .bind(current.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let Some((entity, entity_id, incoming)) = row else {
        return Err(AppError::not_found("conflict"));
    };

    if request.keep == "incoming" {
        match entity.as_str() {
            "collection" => {
                let title = incoming
                    .get("title")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::validation("invalid collection conflict"))?;
                let visibility = incoming
                    .get("visibility")
                    .and_then(Value::as_str)
                    .unwrap_or("private");
                sqlx::query(
                    "update collections set title = $3, visibility = $4
                     where id = $1 and user_id = $2",
                )
                .bind(entity_id)
                .bind(current.user.id)
                .bind(title)
                .bind(visibility)
                .execute(&state.pool)
                .await
                .map_err(AppError::internal)?;
            }
            "comment" => {
                let body = incoming
                    .get("body")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::validation("invalid comment conflict"))?;
                sqlx::query("update comments set body = $3 where id = $1 and user_id = $2")
                    .bind(entity_id)
                    .bind(current.user.id)
                    .bind(body)
                    .execute(&state.pool)
                    .await
                    .map_err(AppError::internal)?;
            }
            _ => return Err(AppError::validation("unknown social entity")),
        }
    }

    sqlx::query("update social_conflicts set resolved_at = now() where id = $1")
        .bind(conflict_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok((
        StatusCode::OK,
        Json(json!({ "resolved": true, "keep": request.keep })),
    ))
}
