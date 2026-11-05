//! Comments on public records.

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct NewComment {
    pub body: String,
    pub parent_id: Option<Uuid>,
}

/// Checks the profile/item visibility and returns the item author.
async fn public_item_author(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    item_id: Uuid,
) -> Result<Uuid, AppError> {
    let author: Option<Uuid> = sqlx::query_scalar(
        "select i.user_id
         from items i join users u on u.id = i.user_id
         where i.id = $1 and i.user_id = $2 and i.deleted_at is null
           and not i.public_hidden and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)",
    )
    .bind(item_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    author.ok_or_else(|| AppError::not_found("record"))
}

async fn blocked_between(pool: &sqlx::PgPool, a: Uuid, b: Uuid) -> Result<bool, AppError> {
    sqlx::query_scalar(
        "select exists(select 1 from blocks
         where (blocker_id = $1 and blocked_id = $2)
            or (blocker_id = $2 and blocked_id = $1))",
    )
    .bind(a)
    .bind(b)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

/// `GET /api/v1/public/users/{user_id}/items/{item_id}/comments`
pub async fn list(
    State(state): State<AppState>,
    Path((user_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, AppError> {
    public_item_author(&state.pool, user_id, item_id).await?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', c.id,
            'parent_id', c.parent_id,
            'body', c.body,
            'created_at', c.created_at,
            'author_id', u.id,
            'author_name', u.display_name,
            'author_avatar', u.avatar_key
         )
         from comments c
         join users u on u.id = c.user_id
         where c.item_id = $1 and c.deleted_at is null and u.deleted_at is null
         order by c.created_at asc",
    )
    .bind(item_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let mut top: Vec<Value> = Vec::new();
    let mut replies: std::collections::BTreeMap<Uuid, Vec<Value>> =
        std::collections::BTreeMap::new();
    for row in rows {
        if let Some(parent) = row
            .get("parent_id")
            .and_then(Value::as_str)
            .and_then(|id| Uuid::parse_str(id).ok())
        {
            replies.entry(parent).or_default().push(row);
        } else {
            top.push(row);
        }
    }
    let comments: Vec<Value> = top
        .into_iter()
        .map(|mut comment| {
            let id = comment
                .get("id")
                .and_then(Value::as_str)
                .and_then(|id| Uuid::parse_str(id).ok());
            comment["replies"] = json!(id.and_then(|id| replies.remove(&id)).unwrap_or_default());
            comment
        })
        .collect();
    Ok(Json(json!({ "comments": comments })))
}

/// `POST /api/v1/public/users/{user_id}/items/{item_id}/comments`
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((user_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<NewComment>,
) -> Result<Json<Value>, AppError> {
    public_item_author(&state.pool, user_id, item_id).await?;
    if blocked_between(&state.pool, current.user.id, user_id).await? {
        return Err(AppError::forbidden("blocked"));
    }
    let body = payload.body.trim();
    if body.is_empty() || body.chars().count() > 2000 {
        return Err(AppError::validation_field(
            "body",
            "comment must be between 1 and 2000 characters",
        ));
    }
    if let Some(parent_id) = payload.parent_id {
        let parent: Option<(Option<Uuid>, bool)> = sqlx::query_as(
            "select parent_id, deleted_at is null from comments
             where id = $1 and item_id = $2",
        )
        .bind(parent_id)
        .bind(item_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?;
        let Some((grandparent, visible)) = parent else {
            return Err(AppError::not_found("comment"));
        };
        if !visible || grandparent.is_some() {
            return Err(AppError::validation_field(
                "parent_id",
                "reply target is invalid",
            ));
        }
    }
    let id = Uuid::new_v4();
    sqlx::query(
        "insert into comments (id, item_id, user_id, parent_id, body)
         values ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(item_id)
    .bind(current.user.id)
    .bind(payload.parent_id)
    .bind(body)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "id": id })))
}

/// `DELETE /api/v1/comments/{id}` — the author can remove their comment.
pub async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update comments set deleted_at = now(), body = ''
         where id = $1 and user_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(current.user.id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("comment"));
    }
    Ok(Json(json!({ "deleted": true })))
}
