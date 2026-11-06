//! User-defined collections ("shelves") of records.

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

#[derive(Debug, Deserialize)]
pub struct CollectionInput {
    pub title: String,
    #[serde(default)]
    pub visibility: Option<String>,
}

fn clean_title(raw: &str) -> Result<String, AppError> {
    let title = raw.trim();
    if title.is_empty() || title.chars().count() > 80 {
        return Err(AppError::validation_field(
            "title",
            "collection title must be between 1 and 80 characters",
        ));
    }
    Ok(title.to_owned())
}

fn clean_visibility(raw: Option<&str>) -> Result<&str, AppError> {
    match raw.unwrap_or("private") {
        "private" | "public" => Ok(raw.unwrap_or("private")),
        _ => Err(AppError::validation_field(
            "visibility",
            "visibility must be private or public",
        )),
    }
}

async fn owned(pool: &sqlx::PgPool, user_id: Uuid, id: Uuid) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from collections where id = $1 and user_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if exists {
        Ok(())
    } else {
        Err(AppError::not_found("collection"))
    }
}

pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', c.id, 'title', c.title, 'slug', c.slug,
            'visibility', c.visibility, 'created_at', c.created_at,
            'item_count', (select count(*) from collection_items ci where ci.collection_id = c.id)
         )
         from collections c
         where c.user_id = $1
         order by c.created_at desc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "collections": rows })))
}

pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(input): Json<CollectionInput>,
) -> Result<(axum::http::StatusCode, Json<Value>), AppError> {
    let title = clean_title(&input.title)?;
    let visibility = clean_visibility(input.visibility.as_deref())?.to_owned();
    let base: String = sqlx::query_scalar("select jey_slug($1)")
        .bind(&title)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    let base = if base.is_empty() {
        "collection".to_owned()
    } else {
        base
    };

    let id = Uuid::new_v4();
    let mut suffix = 0;
    let slug = loop {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        let exists: bool = sqlx::query_scalar(
            "select exists(select 1 from collections where user_id = $1 and slug = $2)",
        )
        .bind(current.user.id)
        .bind(&candidate)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
        if !exists {
            break candidate;
        }
        suffix += 1;
    };

    sqlx::query(
        "insert into collections (id, user_id, title, slug, visibility)
         values ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(current.user.id)
    .bind(&title)
    .bind(&slug)
    .bind(&visibility)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "id": id, "title": title, "slug": slug, "visibility": visibility })),
    ))
}

pub async fn detail(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    let collection: Value = sqlx::query_scalar(
        "select jsonb_build_object('id', id, 'title', title, 'slug', slug,
            'visibility', visibility, 'created_at', created_at)
         from collections where id = $1",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "select item_id from collection_items where collection_id = $1
         order by position asc, created_at asc",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let mut items = Vec::new();
    for item_id in ids {
        if let Some(item) = repo::get(&state.pool, current.user.id, item_id).await? {
            items.push(ItemView::from(item));
        }
    }
    Ok(Json(json!({ "collection": collection, "items": items })))
}

pub async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(input): Json<CollectionInput>,
) -> Result<Json<Value>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    let title = clean_title(&input.title)?;
    let visibility = clean_visibility(input.visibility.as_deref())?;
    sqlx::query(
        "update collections set title = $3, visibility = $4 where id = $1 and user_id = $2",
    )
    .bind(id)
    .bind(current.user.id)
    .bind(&title)
    .bind(visibility)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    sqlx::query("delete from collections where id = $1 and user_id = $2")
        .bind(id)
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn add_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<axum::http::StatusCode, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item"))?;
    sqlx::query(
        "insert into collection_items (collection_id, item_id)
         values ($1, $2) on conflict do nothing",
    )
    .bind(id)
    .bind(item_id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn remove_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<axum::http::StatusCode, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    sqlx::query("delete from collection_items where collection_id = $1 and item_id = $2")
        .bind(id)
        .bind(item_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
