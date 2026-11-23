//! Personal/public S-D tier lists of catalogue records.

use axum::Json;
use axum::extract::{Path, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

const TIERS: [&str; 7] = ["S", "A", "B", "C", "D", "E", "F"];
const KINDS: [&str; 8] = [
    "all", "movie", "tv", "anime", "book", "game", "image", "other",
];

#[derive(Debug, Deserialize)]
pub struct TierListInput {
    pub title: String,
    #[serde(default)]
    pub visibility: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    /// Client-generated id used by the desktop outbox.
    #[serde(default)]
    pub id: Option<Uuid>,
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

fn kind(raw: Option<&str>) -> Result<&str, AppError> {
    let value = raw.unwrap_or("all");
    KINDS
        .iter()
        .copied()
        .find(|kind| *kind == value)
        .ok_or_else(|| AppError::validation_field("kind", "unknown catalogue kind"))
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
        .ok_or_else(|| AppError::validation_field("tier", "tier must be S, A, B, C, D, E or F"))
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

fn auto_tier(rating: i16) -> &'static str {
    match rating {
        10 => "S",
        9 => "A",
        7..=8 => "B",
        5..=6 => "C",
        3..=4 => "D",
        2 => "E",
        _ => "F",
    }
}

async fn auto_list_for_kind(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    kind: &str,
) -> Result<Uuid, AppError> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>(
        "select id from tier_lists where user_id = $1 and kind = $2 and auto",
    )
    .bind(user_id)
    .bind(kind)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    {
        return Ok(id);
    }

    let mut slug = format!("auto-{kind}");
    let mut suffix = 0;
    loop {
        let taken: bool = sqlx::query_scalar(
            "select exists(select 1 from tier_lists where user_id = $1 and slug = $2)",
        )
        .bind(user_id)
        .bind(&slug)
        .fetch_one(pool)
        .await
        .map_err(AppError::internal)?;
        if !taken {
            break;
        }
        suffix += 1;
        slug = format!("auto-{kind}-{suffix}");
    }

    let inserted: Option<Uuid> = sqlx::query_scalar(
        "insert into tier_lists (user_id, title, slug, visibility, kind, auto)
         values ($1, $2, $3, 'private', $4, true)
         on conflict (user_id, kind) where auto do nothing
         returning id",
    )
    .bind(user_id)
    .bind(format!("Авто: {kind}"))
    .bind(&slug)
    .bind(kind)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    if let Some(id) = inserted {
        return Ok(id);
    }
    sqlx::query_scalar("select id from tier_lists where user_id = $1 and kind = $2 and auto")
        .bind(user_id)
        .bind(kind)
        .fetch_one(pool)
        .await
        .map_err(AppError::internal)
}

/// Fill missing auto-list rows from the user's rated items.
pub async fn ensure_auto_lists(pool: &sqlx::PgPool, user_id: Uuid) -> Result<(), AppError> {
    for kind in ["movie", "tv", "anime", "book", "game", "image", "other"] {
        let has_rated: bool = sqlx::query_scalar(
            "select exists(
                select 1 from items
                where user_id = $1 and kind = $2 and deleted_at is null
                  and rating is not null and rating between 1 and 10
            )",
        )
        .bind(user_id)
        .bind(kind)
        .fetch_one(pool)
        .await
        .map_err(AppError::internal)?;
        if !has_rated {
            continue;
        }
        let list_id = auto_list_for_kind(pool, user_id, kind).await?;
        sqlx::query(
            "delete from tier_list_items ti
             using items i
             where ti.tier_list_id = $1 and ti.item_id = i.id
               and (i.deleted_at is not null or i.rating is null
                    or i.kind <> $2 or i.rating < 1 or i.rating > 10)",
        )
        .bind(list_id)
        .bind(kind)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;
        sqlx::query(
            "insert into tier_list_items (tier_list_id, item_id, tier, position)
             select $1, i.id,
                    case
                        when i.rating = 10 then 'S'
                        when i.rating = 9 then 'A'
                        when i.rating between 7 and 8 then 'B'
                        when i.rating between 5 and 6 then 'C'
                        when i.rating between 3 and 4 then 'D'
                        when i.rating = 2 then 'E'
                        else 'F'
                    end,
                    row_number() over (order by i.rating desc, i.created_at) - 1
             from items i
             where i.user_id = $2 and i.kind = $3 and i.deleted_at is null
               and i.rating is not null and i.rating between 1 and 10
               and not exists (
                   select 1 from tier_list_items ti
                   where ti.tier_list_id = $1 and ti.item_id = i.id
               )
             on conflict do nothing",
        )
        .bind(list_id)
        .bind(user_id)
        .bind(kind)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;
    }
    Ok(())
}

/// Move one item into/out of its automatic category list.
pub async fn sync_auto_item(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    item_id: Uuid,
) -> Result<(), AppError> {
    let row: Option<(String, Option<i16>, bool)> = sqlx::query_as(
        "select kind, rating, deleted_at is not null from items where id = $1 and user_id = $2",
    )
    .bind(item_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?;
    let Some((kind, rating, deleted)) = row else {
        return Ok(());
    };
    if deleted || !(1..=10).contains(&rating.unwrap_or(0)) {
        sqlx::query(
            "delete from tier_list_items
             where item_id = $1 and tier_list_id in (
                 select id from tier_lists where user_id = $2 and auto
             )",
        )
        .bind(item_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(AppError::internal)?;
        return Ok(());
    }
    let list_id = auto_list_for_kind(pool, user_id, &kind).await?;
    sqlx::query(
        "delete from tier_list_items
         where item_id = $1 and tier_list_id in (
             select id from tier_lists where user_id = $2 and auto
         )",
    )
    .bind(item_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(AppError::internal)?;
    sqlx::query(
        "insert into tier_list_items (tier_list_id, item_id, tier, position)
         values ($1, $2, $3, 0)
         on conflict (tier_list_id, item_id) do update set tier = excluded.tier",
    )
    .bind(list_id)
    .bind(item_id)
    .bind(auto_tier(rating.unwrap_or(1)))
    .execute(pool)
    .await
    .map_err(AppError::internal)?;
    Ok(())
}

#[derive(Debug, Serialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct TierListView {
    pub id: Uuid,
    pub title: String,
    pub slug: String,
    #[ts(type = "\"all\" | \"movie\" | \"tv\" | \"anime\" | \"book\" | \"game\" | \"image\" | \"other\"")]
    pub kind: String,
    pub auto: bool,
    #[ts(type = "\"private\" | \"public\"")]
    pub visibility: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub handle: Option<String>,
    #[ts(type = "number")]
    pub item_count: i64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct TierListItemView {
    #[serde(flatten)]
    #[ts(flatten)]
    pub item: ItemView,
    #[ts(type = "\"S\" | \"A\" | \"B\" | \"C\" | \"D\" | \"E\" | \"F\"")]
    pub tier: String,
    pub position: i32,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct TierListDetailResponse {
    pub tier_list: TierListView,
    pub items: Vec<TierListItemView>,
}

async fn list_json(pool: &sqlx::PgPool, id: Uuid) -> Result<TierListView, AppError> {
    sqlx::query_as::<_, TierListView>(
        "select t.id, t.title, t.slug, t.kind, t.auto, t.visibility,
                t.created_at, t.updated_at, u.handle,
                (select count(*) from tier_list_items ti where ti.tier_list_id = t.id) as item_count
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
) -> Result<Vec<TierListItemView>, AppError> {
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
            items.push(TierListItemView {
                item: ItemView::from(item),
                tier,
                position,
            });
        }
    }
    Ok(items)
}

async fn public_items(
    state: &AppState,
    owner: Uuid,
    list_id: Uuid,
) -> Result<Vec<TierListItemView>, AppError> {
    let rows: Vec<(Uuid, String, i32)> = sqlx::query_as(
        "select ti.item_id, ti.tier, ti.position
         from tier_list_items ti
         join items i on i.id = ti.item_id
         join tier_lists tl on tl.id = ti.tier_list_id
         where ti.tier_list_id = $1 and i.deleted_at is null
           and i.status = 'done' and i.public_hidden = false
           and (tl.kind = 'all' or i.kind = tl.kind)
         order by ti.tier, ti.position, ti.created_at",
    )
    .bind(list_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let mut items = Vec::new();
    for (item_id, tier, position) in rows {
        if let Some(item) = repo::get(&state.pool, owner, item_id).await? {
            items.push(TierListItemView {
                item: ItemView::from(item),
                tier,
                position,
            });
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
            'id', t.id, 'title', t.title, 'slug', t.slug, 'kind', t.kind, 'auto', t.auto,
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
    let kind = kind(input.kind.as_deref())?;
    let slug = slug_for(&state.pool, current.user.id, &title).await?;
    let id = input.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        "insert into tier_lists (id, user_id, title, slug, visibility, kind)
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(current.user.id)
    .bind(&title)
    .bind(&slug)
    .bind(visible)
    .bind(kind)
    .execute(&state.pool)
    .await
    .map_err(|error| {
        if error
            .as_database_error()
            .is_some_and(|db| db.is_unique_violation())
        {
            AppError::conflict("tier list id already exists")
        } else {
            AppError::internal(error)
        }
    })?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(
            json!({ "id": id, "title": title, "slug": slug, "visibility": visible, "kind": kind }),
        ),
    ))
}

/// `GET /api/v1/tier-lists/{id}`
pub async fn detail(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TierListDetailResponse>, AppError> {
    owned(&state.pool, current.user.id, id).await?;
    Ok(Json(TierListDetailResponse {
        tier_list: list_json(&state.pool, id).await?,
        items: owner_items(&state, current.user.id, id).await?,
    }))
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
    let kind = kind(input.kind.as_deref())?;
    sqlx::query("update tier_lists set title = $3, visibility = $4, kind = $5, updated_at = now() where id = $1 and user_id = $2")
        .bind(id)
        .bind(current.user.id)
        .bind(title)
        .bind(visible)
        .bind(kind)
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
    let auto: bool = sqlx::query_scalar("select auto from tier_lists where id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    if auto {
        return Err(AppError::validation(
            "automatic tier lists cannot be deleted; change item ratings instead",
        ));
    }
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
    let item = repo::get(&state.pool, current.user.id, item_id)
        .await?
        .ok_or_else(|| AppError::not_found("item"))?;
    let list_kind: String = sqlx::query_scalar("select kind from tier_lists where id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    if list_kind != "all" && item.kind.as_str() != list_kind {
        return Err(AppError::validation_field(
            "kind",
            "item kind does not match tier list kind",
        ));
    }
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
    let auto: bool = sqlx::query_scalar("select auto from tier_lists where id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::internal)?;
    if auto {
        return Err(AppError::validation(
            "automatic tier list items cannot be removed; change the item rating instead",
        ));
    }
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
) -> Result<Json<TierListDetailResponse>, AppError> {
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
    Ok(Json(TierListDetailResponse {
        tier_list: list_json(&state.pool, id).await?,
        items: public_items(&state, owner, id).await?,
    }))
}
