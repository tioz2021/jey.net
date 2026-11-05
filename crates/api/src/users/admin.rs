//! Admin-only user directory and account actions.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

async fn require_admin(state: &AppState, current: &CurrentUser) -> Result<(), AppError> {
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
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub offset: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

/// `GET /api/v1/admin/users?q=...`
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    let q = query.q.trim();
    let pattern = format!("%{q}%");
    let limit = query.limit.clamp(1, 100);
    let offset = query.offset.max(0);
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'display_name', u.display_name,
             'is_public', u.is_public,
             'is_admin', coalesce(u.is_admin, false),
             'is_test', u.is_test,
             'suspended_at', u.suspended_at,
             'created_at', u.created_at,
             'last_seen_at', s.last_seen_at,
             'online', s.last_seen_at > now() - interval '5 minutes',
             'items', coalesce(i.total, 0)
         )
         from users u
         left join lateral (
             select max(last_seen_at) as last_seen_at
             from sessions
             where user_id = u.id and expires_at > now()
         ) s on true
         left join lateral (
             select count(*) as total
             from items
             where user_id = u.id and deleted_at is null
         ) i on true
         where u.deleted_at is null
           and ($1 = '' or u.display_name ilike $2 or u.email ilike $2)
         order by u.created_at desc
         limit $3 offset $4",
    )
    .bind(q)
    .bind(&pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let total: i64 = sqlx::query_scalar(
        "select count(*) from users
         where deleted_at is null
           and ($1 = '' or display_name ilike $2 or email ilike $2)",
    )
    .bind(q)
    .bind(&pattern)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let test_total: i64 =
        sqlx::query_scalar("select count(*) from users where is_test and deleted_at is null")
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
    Ok(Json(
        json!({ "users": rows, "total": total, "test_total": test_total }),
    ))
}

async fn target(state: &AppState, id: Uuid) -> Result<(String, bool), AppError> {
    sqlx::query_as("select display_name, coalesce(is_admin, false) from users where id = $1 and deleted_at is null")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?
        .ok_or_else(|| AppError::not_found("user"))
}

/// `POST /api/v1/admin/users/{id}/sessions/revoke`
pub async fn revoke_sessions(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    target(&state, id).await?;
    if id == current.user.id {
        return Err(AppError::validation_field(
            "id",
            "cannot revoke your own sessions here",
        ));
    }
    let (name, _) = target(&state, id).await?;
    let deleted = sqlx::query("delete from sessions where user_id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?
        .rows_affected();
    crate::audit::record(
        &state,
        &current,
        "user.sessions_revoked",
        "user",
        Some(id),
        Some(&name),
        json!({ "revoked": deleted }),
    )
    .await;
    Ok(Json(json!({ "revoked": deleted })))
}

#[derive(Debug, Deserialize)]
pub struct SuspendInput {
    pub suspended: bool,
    pub reason: Option<String>,
}

/// `PATCH /api/v1/admin/users/{id}/suspension`
pub async fn suspend(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SuspendInput>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    if id == current.user.id {
        return Err(AppError::validation_field("id", "cannot suspend yourself"));
    }
    let (name, is_admin) = target(&state, id).await?;
    if is_admin {
        return Err(AppError::validation_field(
            "id",
            "cannot suspend an administrator",
        ));
    }
    let reason = payload
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    sqlx::query(
        "update users set suspended_at = case when $2 then now() else null end
         where id = $1",
    )
    .bind(id)
    .bind(payload.suspended)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if payload.suspended {
        sqlx::query("delete from sessions where user_id = $1")
            .bind(id)
            .execute(&state.pool)
            .await
            .map_err(AppError::internal)?;
    }
    crate::audit::record(
        &state,
        &current,
        if payload.suspended {
            "user.suspended"
        } else {
            "user.restored"
        },
        "user",
        Some(id),
        Some(&name),
        json!({ "reason": reason }),
    )
    .await;
    Ok(Json(json!({ "suspended": payload.suspended })))
}

#[derive(Debug, Deserialize)]
pub struct AdminInput {
    pub is_admin: bool,
}

/// `PATCH /api/v1/admin/users/{id}/admin`
pub async fn set_admin(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<AdminInput>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    target(&state, id).await?;
    if id == current.user.id && !payload.is_admin {
        return Err(AppError::validation_field(
            "id",
            "cannot remove your own admin role",
        ));
    }
    if !payload.is_admin {
        let admins: i64 =
            sqlx::query_scalar("select count(*) from users where is_admin and deleted_at is null")
                .fetch_one(&state.pool)
                .await
                .map_err(AppError::internal)?;
        if admins <= 1 {
            return Err(AppError::validation_field(
                "id",
                "at least one administrator is required",
            ));
        }
    }
    sqlx::query("update users set is_admin = $2 where id = $1")
        .bind(id)
        .bind(payload.is_admin)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    let (name, _) = target(&state, id).await?;
    crate::audit::record(
        &state,
        &current,
        if payload.is_admin {
            "user.admin_granted"
        } else {
            "user.admin_removed"
        },
        "user",
        Some(id),
        Some(&name),
        json!({}),
    )
    .await;
    Ok(Json(json!({ "is_admin": payload.is_admin })))
}

#[derive(Debug, Deserialize)]
pub struct TestInput {
    pub is_test: bool,
}

/// `PATCH /api/v1/admin/users/{id}/test`
pub async fn set_test(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<TestInput>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    let (name, is_admin) = target(&state, id).await?;
    if is_admin {
        return Err(AppError::validation_field(
            "id",
            "cannot mark an administrator as test",
        ));
    }
    sqlx::query(
        "update users
         set is_test = $2,
             is_public = case when $2 then false else is_public end
         where id = $1",
    )
    .bind(id)
    .bind(payload.is_test)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    crate::audit::record(
        &state,
        &current,
        if payload.is_test {
            "user.test_marked"
        } else {
            "user.test_unmarked"
        },
        "user",
        Some(id),
        Some(&name),
        json!({}),
    )
    .await;
    Ok(Json(json!({ "is_test": payload.is_test })))
}

#[derive(Debug, Deserialize)]
pub struct PurgeInput {
    pub confirm: String,
}

/// `POST /api/v1/admin/test-data/purge`
pub async fn purge_test_data(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<PurgeInput>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &current).await?;
    if payload.confirm.trim() != "delete" {
        return Err(AppError::validation_field(
            "confirm",
            "type delete to confirm",
        ));
    }
    let admins: i64 = sqlx::query_scalar(
        "select count(*) from users where is_test and coalesce(is_admin, false) and deleted_at is null",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if admins > 0 {
        return Err(AppError::validation_field(
            "id",
            "unmark test administrators before purging",
        ));
    }
    let users: Vec<Uuid> = sqlx::query_scalar(
        "select id from users where is_test and deleted_at is null and id <> $1",
    )
    .bind(current.user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let count = users.len();
    if count == 0 {
        return Ok(Json(json!({ "deleted": 0 })));
    }
    sqlx::query("delete from users where id = any($1) and is_test")
        .bind(&users)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    crate::audit::record(
        &state,
        &current,
        "test_data.purged",
        "test_data",
        None,
        None,
        json!({ "users": count }),
    )
    .await;
    Ok(Json(json!({ "deleted": count })))
}

/// `DELETE /api/v1/admin/users/{id}`
pub async fn delete(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_admin(&state, &current).await?;
    if id == current.user.id {
        return Err(AppError::validation_field("id", "cannot delete yourself"));
    }
    let (name, is_admin) = target(&state, id).await?;
    if is_admin {
        return Err(AppError::validation_field(
            "id",
            "cannot delete an administrator",
        ));
    }
    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    sqlx::query("delete from sessions where user_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    sqlx::query("delete from devices where user_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    let email = format!("deleted-{id}@invalid");
    sqlx::query(
        "update users set
             deleted_at = now(), email = $2, display_name = 'Deleted user',
             is_public = false, email_verified_at = null, suspended_at = null
         where id = $1",
    )
    .bind(id)
    .bind(email)
    .execute(&mut *tx)
    .await
    .map_err(AppError::internal)?;
    tx.commit().await.map_err(AppError::internal)?;
    crate::audit::record(
        &state,
        &current,
        "user.deleted",
        "user",
        Some(id),
        Some(&name),
        json!({}),
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}
