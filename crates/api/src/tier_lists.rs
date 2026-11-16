//! Personal/public S-D tier lists of catalogue records.

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

const TIERS: [&str; 5] = ["S", "A", "B", "C", "D"];

#[derive(Debug, Deserialize)]
pub struct TierListInput {
    pub title: String,
    #[serde(default)]
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TierItemInput {
    pub tier: String,
    #[serde(default)]
    pub position: Option<i32>,
}

fn title(raw: &str) -> Result<String, AppError> {
    let title = raw.trim();
    if title.is_empty() || title.chars().count() > 80 {
        return Err(AppError::validation_field(
            "title",
            "tier list title must be between 1 and 80 characters",
        ));
    }
    Ok(title.to_owned())
}

fn visibility(raw: Option<&str>) -> Result<&str, AppError> {
    match raw.unwrap_or("private") {
        value @ ("private" | "public") => Ok(value),
        _ => Err(AppError::validation_field(
            "visibility",
            "visibility must be private or public",
        )),
    }
}

fn tier(raw: &str) -> Result<&'static str, AppError> {
    let value = raw.trim().to_uppercase();
    TIERS
        .iter()
        .copied()
        .find(|tier| *tier == value)
        .ok_or_else(|| AppError::validation_field("tier", "tier must be S, A, B, C or D"))
}

async fn owned(pool: &sqlx::PgPool, user_id: Uuid, id: Uuid) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "select exists(select 1 from tier_lists where id = $1 and user_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;
    if exists {
        Ok(())
    } else {
        Err(AppError::not_found("tier list"))
    }
}

async fn slug_for(pool: &sqlx::PgPool, user_id: Uuid, title: &str) -> Result<String, AppError> {
    let base: String = sqlx::query_scalar("select jey_slug($1)")
        .bind(title)
        .fetch_one(pool)
        .await
        .map_err(AppError::internal)?;
    let base = if base.is_empty() {
        "tier-list".to_owned()
    } else {
        base
    };
    for suffix in 0..1000 {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        let exists: bool = sqlx::query_scalar(
            "select exists(select 1 from tier_lists where user_id = $1 and slug = $2)",
        )
        .bind(user_id)
        .bind(&candidate)
        .fetch_one(pool)
        .await
        .map_err(AppError::internal)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err(AppError::conflict("could not allocate tier list slug"))
}

async fn list_json(pool: &sqlx::PgPool, id: Uuid) -> Result<Value, AppError> {
    sqlx::query_scalar(
        "select jsonb_build_object(
            'id', t.id, 'title', t.title, 'slug', t.slug,
            'visibility', t.visibility, 'created_at', t.created_at,
            'updated_at', t.updated_at, 'handle', u.handle,
            'item_count', (select count(*) from tier_list_items ti where ti.tier_list_id = t.id)
         )
         from tier_lists t join users u on u.id = t.user_id
         where t.id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

async fn owner_items(
    state: &AppState,
    user_id: Uuid,
    list_id: Uuid,
) -> Result<Vec<Value>, AppError> {
    let rows: Vec<(Uuid, String, i32)> = sqlx::query_as(
        "select item_id, tier, position from tier_list_items
         where tier_list_id = $1 order by tier, position, created_at",
    )
    .bind(list_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let mut items = Vec::new();
    for (item_id, tier, position) in rows {
        if let Some(item) = repo::get(&state.pool, user_id, item_id).await? {
            let mut value = serde_json::to_value(ItemView::from(item)).unwrap_or(Value::Null);
            if let Some(object) = value.as_object_mut() {
                object.insert("tier".to_owned(), Value::String(tier));
                object.insert("position".to_owned(), Value::from(position));
            }
            items.push(value);
        }
    }
    Ok(items)
}

async fn public_items(
    state: &AppState,
    owner: Uuid,
    list_id: Uuid,
) -> Result<Vec<Value>, AppError> {
    let rows: Vec<(Uuid, String, i32)> = sqlx::query_as(
        "select ti.item_id, ti.tier, ti.position
         from tier_list_items ti
         join items i on i.id = ti.item_id
         where ti.tier_list_id = $1 and i.deleted_at is null
           and i.status = 'done' and i.public_hidden = false
         order by ti.tier, ti.position, ti.created_at",
    )
    .bind(list_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let mut items = Vec::new();
    for (item_id, tier, position) in rows {
        if let Some(item) = repo::get(&state.pool, owner, item_id).await? {
            let mut value = serde_json::to_value(ItemView::from(item)).unwrap_or(Value::Null);
            if let Some(object) = value.as_object_mut() {
                object.insert("tier".to_owned(), Value::String(tier));
                object.insert("position".to_owned(), Value::from(position));
            }
            items.push(value);
        }
    }
    Ok(items)
}

/// `GET /api/v1/tier-lists`
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', t.id, 'title', t.title, 'slug', t.slug,
            'visibility', t.visibility, 'created_at', t.created_at,
            'updated_at', t.updated_at,
            'item_count', (select count(*) from tier_list_items ti where ti.tier_list_id = t.id)
         ) from tier_lists t where t.user_id = $1 order by t.updated_at desc",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "tier_lists": rows })))
}

/// `POST /api/v1/tier-lists`
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(input): Json<TierListInput>,
) -> Result<(axum::http::StatusCode, Json<Value>), AppError> {
    let title = title(&input.title)?;
    let visible = visibility(input.visibility.as_deref())?;
    let slug = slug_for(&state.pool, current.user.id, &title).await?;
    let id: Uuid = sqlx::query_scalar(
        "insert into tier_lists (user_id, title, slug, visibility)
         values ($1, $2, $3, $4) returning id",
    )
    .bind(current.user.id)
    .bind(&title)
    .bind(&slug)
    .bind(visible)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "id": id, "title": title, "slug": slug, "visibility": visible })),
    ))
}

/// `GET /api/v1/tier-lists/{id}`
pub async fn detail(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    Ok(Json(
        json!({ "tier_list": list_json(&state.pool, id).await?, "items": owner_items(&state, current.user.id, id).await? }),
    ))
}

/// `PATCH /api/v1/tier-lists/{id}`
pub async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(input): Json<TierListInput>,
) -> Result<Json<Value>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    let title = title(&input.title)?;
    let visible = visibility(input.visibility.as_deref())?;
    sqlx::query("update tier_lists set title = $3, visibility = $4, updated_at = now() where id = $1 and user_id = $2")
        .bind(id)
        .bind(current.user.id)
        .bind(title)
        .bind(visible)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true })))
}

/// `DELETE /api/v1/tier-lists/{id}`
pub async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    sqlx::query("delete from tier_lists where id = $1 and user_id = $2")
        .bind(id)
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// `PUT /api/v1/tier-lists/{id}/items/{item_id}`
pub async fn place_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, item_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<TierItemInput>,
) -> Result<Json<Value>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item"))?;
    let tier = tier(&input.tier)?;
    let position = input.position.unwrap_or(0);
    sqlx::query(
        "insert into tier_list_items (tier_list_id, item_id, tier, position)
         values ($1, $2, $3, $4)
         on conflict (tier_list_id, item_id) do update set tier = excluded.tier, position = excluded.position",
    )
    .bind(id)
    .bind(item_id)
    .bind(tier)
    .bind(position)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    sqlx::query("update tier_lists set updated_at = now() where id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true, "tier": tier })))
}

/// `DELETE /api/v1/tier-lists/{id}/items/{item_id}`
pub async fn remove_item(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<axum::http::StatusCode, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    sqlx::query("delete from tier_list_items where tier_list_id = $1 and item_id = $2")
        .bind(id)
        .bind(item_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// `GET /api/v1/public/users/{id}/tier-lists/{slug}`
pub async fn public_detail(
    State(state): State<AppState>,
    Path((user_id, slug)): Path<(String, String)>,
) -> Result<Json<Value>, AppError> {
    let owner: Option<Uuid> = if let Ok(uuid) = Uuid::parse_str(&user_id) {
        Some(uuid)
    } else {
        sqlx::query_scalar("select id from users where handle = $1 and deleted_at is null")
            .bind(&user_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(AppError::internal)?
    };
    let Some(owner) = owner else {
        return Err(AppError::not_found("tier list"));
    };
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "select t.id, t.user_id from tier_lists t join users u on u.id = t.user_id
         where t.user_id = $1 and t.slug = $2 and t.visibility = 'public'
           and u.is_public and u.deleted_at is null",
    )
    .bind(owner)
    .bind(&slug)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let Some((id, owner)) = row else {
        return Err(AppError::not_found("tier list"));
    };
    Ok(Json(
        json!({ "tier_list": list_json(&state.pool, id).await?, "items": public_items(&state, owner, id).await? }),
    ))
}
