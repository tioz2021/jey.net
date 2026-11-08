//! Comments on public records.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::users::notifications::{SocialNotification, notify_social};

#[derive(Debug, Deserialize)]
pub struct NewComment {
    pub body: String,
    pub parent_id: Option<Uuid>,
    /// Supplied by the desktop sync worker so local IDs stay stable.
    #[serde(default)]
    pub id: Option<Uuid>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CommentQuery {
    pub offset: Option<i64>,
    pub limit: Option<i64>,
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
    Query(query): Query<CommentQuery>,
) -> Result<Json<Value>, AppError> {
    public_item_author(&state.pool, user_id, item_id).await?;
    let limit = query.limit.unwrap_or(5).clamp(1, 20);
    let offset = query.offset.unwrap_or(0).clamp(0, 100_000);
    // Count only comments that the list can actually render: live top-level
    // records authored by live users. A reply to a deleted root is not visible.
    let total: i64 = sqlx::query_scalar(
        "select count(*)
         from comments c join users u on u.id = c.user_id
         where c.item_id = $1 and c.parent_id is null
           and c.deleted_at is null and u.deleted_at is null",
    )
    .bind(item_id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;

    let mut top: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', c.id,
            'parent_id', c.parent_id,
            'body', c.body,
            'created_at', c.created_at,
            'author_id', u.id,
            'author_name', u.display_name,
            'author_avatar', u.avatar_key,
            'like_count', (select count(*) from comment_reactions cr where cr.comment_id = c.id),
            'liker_ids', (select coalesce(jsonb_agg(cr.user_id), '[]'::jsonb) from comment_reactions cr where cr.comment_id = c.id)
         )
         from comments c
         join users u on u.id = c.user_id
         where c.item_id = $1 and c.parent_id is null
           and c.deleted_at is null and u.deleted_at is null
         order by c.created_at desc, c.id desc
         limit $2 offset $3",
    )
    .bind(item_id)
    .bind(limit + 1)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let has_more = top.len() as i64 > limit;
    if has_more {
        top.truncate(limit as usize);
    }

    let ids: Vec<Uuid> = top
        .iter()
        .filter_map(|row| {
            row.get("id")
                .and_then(Value::as_str)
                .and_then(|id| Uuid::parse_str(id).ok())
        })
        .collect();
    for row in &mut top {
        row["replies"] = json!([]);
    }

    let mut replies: std::collections::BTreeMap<Uuid, Vec<Value>> =
        std::collections::BTreeMap::new();
    if !ids.is_empty() {
        let children: Vec<Value> = sqlx::query_scalar(
            "select jsonb_build_object(
                'id', c.id,
                'parent_id', c.parent_id,
                'body', c.body,
                'created_at', c.created_at,
                'author_id', u.id,
                'author_name', u.display_name,
                'author_avatar', u.avatar_key,
                'like_count', (select count(*) from comment_reactions cr where cr.comment_id = c.id),
                'liker_ids', (select coalesce(jsonb_agg(cr.user_id), '[]'::jsonb) from comment_reactions cr where cr.comment_id = c.id)
             )
             from comments c
             join users u on u.id = c.user_id
             where c.item_id = $1 and c.parent_id = ANY($2)
               and c.deleted_at is null and u.deleted_at is null
             order by c.created_at asc, c.id asc",
        )
        .bind(item_id)
        .bind(&ids)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::internal)?;
        for mut child in children {
            child["replies"] = json!([]);
            if let Some(parent) = child
                .get("parent_id")
                .and_then(Value::as_str)
                .and_then(|id| Uuid::parse_str(id).ok())
            {
                replies.entry(parent).or_default().push(child);
            }
        }
    }
    for row in &mut top {
        if let Some(id) = row
            .get("id")
            .and_then(Value::as_str)
            .and_then(|id| Uuid::parse_str(id).ok())
        {
            row["replies"] = json!(replies.remove(&id).unwrap_or_default());
        }
    }

    Ok(Json(json!({
        "comments": top,
        "total": total,
        "next_offset": if has_more { Some(offset + limit) } else { None },
    })))
}

/// `POST /api/v1/public/users/{user_id}/items/{item_id}/comments`
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((user_id, item_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<NewComment>,
) -> Result<Json<Value>, AppError> {
    let owner = public_item_author(&state.pool, user_id, item_id).await?;
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
        let parent: Option<(Option<Uuid>, bool, Uuid)> = sqlx::query_as(
            "select parent_id, deleted_at is null, user_id from comments
             where id = $1 and item_id = $2",
        )
        .bind(parent_id)
        .bind(item_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?;
        let Some((grandparent, visible, _)) = parent else {
            return Err(AppError::not_found("comment"));
        };
        if !visible || grandparent.is_some() {
            return Err(AppError::validation_field(
                "parent_id",
                "reply target is invalid",
            ));
        }
    }
    let id = payload.id.unwrap_or_else(Uuid::new_v4);
    if payload.id.is_some() {
        let exists: bool =
            sqlx::query_scalar("select exists(select 1 from comments where id = $1)")
                .bind(id)
                .fetch_one(&state.pool)
                .await
                .map_err(AppError::internal)?;
        if exists {
            let stored: Option<Value> = sqlx::query_scalar(
                "select to_jsonb(c) from comments c where id = $1 and item_id = $2",
            )
            .bind(id)
            .bind(item_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(AppError::internal)?;
            if let Some(stored) = stored {
                let same = stored.get("body").and_then(Value::as_str) == Some(body);
                if !same {
                    let incoming = json!({
                        "body": body,
                        "parent_id": payload.parent_id,
                    });
                    crate::social_conflicts::record(
                        &state.pool,
                        current.user.id,
                        "comment",
                        id,
                        &incoming,
                        &stored,
                    )
                    .await?;
                }
            }
            return Err(AppError::conflict("comment already exists"));
        }
    }
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

    let target = if let Some(parent_id) = payload.parent_id {
        sqlx::query_scalar::<_, Uuid>("select user_id from comments where id = $1")
            .bind(parent_id)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?
    } else {
        owner
    };
    let (kind, action) = if payload.parent_id.is_some() {
        ("reply", "ответил(а) на ваш комментарий")
    } else {
        ("comment", "прокомментировал(а) вашу запись")
    };
    notify_social(
        &state,
        target,
        current.user.id,
        SocialNotification {
            kind,
            item_id,
            comment_id: Some(id),
            push_body: &format!("{} {action}", current.user.display_name),
            url: &format!("/u/{user_id}/{item_id}"),
        },
    )
    .await;
    Ok(Json(json!({ "id": id })))
}

/// `POST /api/v1/comments/{id}/reaction` — toggle a like on a comment.
pub async fn toggle_reaction(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let context: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "select c.item_id, c.user_id, i.user_id
         from comments c join items i on i.id = c.item_id
         join users u on u.id = i.user_id
         where c.id = $1 and c.deleted_at is null
           and i.deleted_at is null and not i.public_hidden
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let Some((item_id, comment_author, item_owner)) = context else {
        return Err(AppError::not_found("comment"));
    };
    if blocked_between(&state.pool, current.user.id, item_owner).await? {
        return Err(AppError::forbidden("blocked"));
    }
    let removed =
        sqlx::query("delete from comment_reactions where user_id = $1 and comment_id = $2")
            .bind(current.user.id)
            .bind(id)
            .execute(&state.pool)
            .await
            .map_err(AppError::internal)?
            .rows_affected()
            > 0;
    if !removed {
        sqlx::query(
            "insert into comment_reactions (user_id, comment_id) values ($1, $2)
             on conflict do nothing",
        )
        .bind(current.user.id)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    }
    if !removed {
        notify_social(
            &state,
            comment_author,
            current.user.id,
            SocialNotification {
                kind: "reaction",
                item_id,
                comment_id: Some(id),
                push_body: &format!(
                    "{} отреагировал(а) на ваш комментарий",
                    current.user.display_name
                ),
                url: &format!("/u/{item_owner}/{item_id}"),
            },
        )
        .await;
    }
    let count: i64 =
        sqlx::query_scalar("select count(*) from comment_reactions where comment_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
    Ok(Json(json!({ "reacted": !removed, "count": count })))
}

/// `PUT /api/v1/comments/{id}/reaction` — set like state explicitly.
pub async fn set_reaction(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<ReactionInput>,
) -> Result<Json<Value>, AppError> {
    let context: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "select c.item_id, c.user_id, i.user_id
         from comments c join items i on i.id = c.item_id
         join users u on u.id = i.user_id
         where c.id = $1 and c.deleted_at is null
           and i.deleted_at is null and not i.public_hidden
           and u.is_public and u.deleted_at is null
           and i.status = ANY(u.public_statuses)",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let Some((item_id, comment_author, item_owner)) = context else {
        return Err(AppError::not_found("comment"));
    };
    if blocked_between(&state.pool, current.user.id, item_owner).await? {
        return Err(AppError::forbidden("blocked"));
    }
    if payload.liked {
        sqlx::query("insert into comment_reactions (user_id, comment_id) values ($1, $2) on conflict do nothing")
            .bind(current.user.id)
            .bind(id)
            .execute(&state.pool)
            .await
            .map_err(AppError::internal)?;
        notify_social(
            &state,
            comment_author,
            current.user.id,
            SocialNotification {
                kind: "reaction",
                item_id,
                comment_id: Some(id),
                push_body: &format!(
                    "{} отреагировал(а) на ваш комментарий",
                    current.user.display_name
                ),
                url: &format!("/u/{item_owner}/{item_id}"),
            },
        )
        .await;
    } else {
        sqlx::query("delete from comment_reactions where user_id = $1 and comment_id = $2")
            .bind(current.user.id)
            .bind(id)
            .execute(&state.pool)
            .await
            .map_err(AppError::internal)?;
    }
    let count: i64 =
        sqlx::query_scalar("select count(*) from comment_reactions where comment_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
    Ok(Json(json!({ "reacted": payload.liked, "count": count })))
}

#[derive(Debug, Deserialize)]
pub struct ReactionInput {
    pub liked: bool,
}

/// `DELETE /api/v1/comments/{id}` — the author can remove their comment.
pub async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let changed = sqlx::query(
        "update comments set deleted_at = now()
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
