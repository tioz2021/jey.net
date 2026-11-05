//! User reports and the small moderation queue.

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct NewReport {
    pub target_type: String,
    pub target_id: Uuid,
    pub reason: String,
    pub details: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveReport {
    pub status: String,
    #[serde(default)]
    pub hide_target: bool,
}

async fn is_admin(state: &AppState, user_id: Uuid) -> Result<bool, AppError> {
    sqlx::query_scalar("select coalesce(is_admin, false) from users where id = $1")
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)
        .map(|value| value.unwrap_or(false))
}

/// `POST /api/v1/reports`
pub async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(payload): Json<NewReport>,
) -> Result<Json<Value>, AppError> {
    if !matches!(payload.target_type.as_str(), "item" | "comment" | "profile") {
        return Err(AppError::validation_field(
            "target_type",
            "target_type must be item, comment or profile",
        ));
    }
    if !matches!(
        payload.reason.as_str(),
        "spam" | "abuse" | "spoilers" | "other"
    ) {
        return Err(AppError::validation_field(
            "reason",
            "reason must be spam, abuse, spoilers or other",
        ));
    }
    let details = payload
        .details
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if details.is_some_and(|value| value.chars().count() > 1000) {
        return Err(AppError::validation_field(
            "details",
            "details are too long",
        ));
    }

    let owner: Option<Uuid> = match payload.target_type.as_str() {
        "item" => sqlx::query_scalar(
            "select i.user_id from items i join users u on u.id = i.user_id
             where i.id = $1 and i.deleted_at is null and not i.public_hidden
               and u.is_public and u.deleted_at is null
               and i.status = ANY(u.public_statuses)",
        )
        .bind(payload.target_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?,
        "comment" => sqlx::query_scalar(
            "select i.user_id from comments c join items i on i.id = c.item_id
             join users u on u.id = i.user_id
             where c.id = $1 and c.deleted_at is null and i.deleted_at is null
               and not i.public_hidden and u.is_public and u.deleted_at is null
               and i.status = ANY(u.public_statuses)",
        )
        .bind(payload.target_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?,
        "profile" => sqlx::query_scalar(
            "select id from users where id = $1 and is_public and deleted_at is null",
        )
        .bind(payload.target_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::internal)?,
        _ => None,
    };
    let Some(owner) = owner else {
        return Err(AppError::not_found("report target"));
    };
    if owner == current.user.id {
        return Err(AppError::validation_field(
            "target_id",
            "you cannot report your own content",
        ));
    }

    sqlx::query(
        "insert into reports (reporter_id, target_type, target_id, reason, details)
         values ($1, $2, $3, $4, $5)
         on conflict (reporter_id, target_type, target_id) do nothing",
    )
    .bind(current.user.id)
    .bind(&payload.target_type)
    .bind(payload.target_id)
    .bind(&payload.reason)
    .bind(details)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "reported": true })))
}

/// `GET /api/v1/reports` — admin queue.
pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Value>, AppError> {
    if !is_admin(&state, current.user.id).await? {
        return Err(AppError::forbidden("admin only"));
    }
    let rows: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
            'id', r.id,
            'target_type', r.target_type,
            'target_id', r.target_id,
            'reason', r.reason,
            'details', r.details,
            'status', r.status,
            'created_at', r.created_at,
            'resolved_at', r.resolved_at,
            'reporter_name', reporter.display_name,
            'target_label', coalesce(i.title, left(c.body, 120), target_user.display_name, '—'),
            'target_available', case
                when r.target_type = 'item'
                    then i.id is not null and i.deleted_at is null and not i.public_hidden
                when r.target_type = 'comment'
                    then c.id is not null and c.deleted_at is null
                         and ci.id is not null and ci.deleted_at is null and not ci.public_hidden
                when r.target_type = 'profile'
                    then target_user.id is not null and target_user.is_public
                         and target_user.deleted_at is null
                else false
            end,
            'target_url', case
                when r.target_type = 'item' and i.id is not null
                     and i.deleted_at is null and not i.public_hidden
                    then '/u/' || i.user_id || '/' || i.id
                when r.target_type = 'comment' and c.id is not null
                     and c.deleted_at is null and ci.id is not null
                     and ci.deleted_at is null and not ci.public_hidden
                    then '/u/' || ci.user_id || '/' || c.item_id
                when r.target_type = 'profile' and target_user.id is not null
                     and target_user.is_public and target_user.deleted_at is null
                    then '/u/' || target_user.id
                else null
            end
         )
         from reports r
         join users reporter on reporter.id = r.reporter_id
         left join items i on r.target_type = 'item' and i.id = r.target_id
         left join comments c on r.target_type = 'comment' and c.id = r.target_id
         left join items ci on ci.id = c.item_id
         left join users target_user on r.target_type = 'profile' and target_user.id = r.target_id
         order by (r.status = 'open') desc, r.created_at desc
         limit 400",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let reports: Vec<Value> = rows
        .iter()
        .filter(|row| row["status"] == "open")
        .cloned()
        .collect();
    let history: Vec<Value> = rows
        .into_iter()
        .filter(|row| row["status"] != "open")
        .collect();
    Ok(Json(json!({ "reports": reports, "history": history })))
}

/// `PATCH /api/v1/reports/{id}`
pub async fn resolve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<ResolveReport>,
) -> Result<Json<Value>, AppError> {
    if !is_admin(&state, current.user.id).await? {
        return Err(AppError::forbidden("admin only"));
    }
    if !matches!(payload.status.as_str(), "resolved" | "dismissed" | "open") {
        return Err(AppError::validation_field(
            "status",
            "status must be resolved, dismissed or open",
        ));
    }
    if payload.status == "open" {
        let changed = sqlx::query(
            "update reports set status = 'open', resolved_at = null, resolved_by = null
             where id = $1 and status <> 'open'",
        )
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?
        .rows_affected();
        if changed == 0 {
            return Err(AppError::not_found("report"));
        }
        return Ok(Json(json!({ "ok": true })));
    }

    let target: Option<(String, Uuid)> = sqlx::query_as(
        "select target_type, target_id from reports where id = $1 and status = 'open'",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::internal)?;
    let Some((target_type, target_id)) = target else {
        return Err(AppError::not_found("report"));
    };

    if payload.hide_target {
        match target_type.as_str() {
            "item" => {
                sqlx::query("update items set public_hidden = true where id = $1")
                    .bind(target_id)
                    .execute(&state.pool)
                    .await
                    .map_err(AppError::internal)?;
            }
            "comment" => {
                sqlx::query("update comments set deleted_at = now() where id = $1")
                    .bind(target_id)
                    .execute(&state.pool)
                    .await
                    .map_err(AppError::internal)?;
            }
            "profile" => {
                sqlx::query("update users set is_public = false where id = $1")
                    .bind(target_id)
                    .execute(&state.pool)
                    .await
                    .map_err(AppError::internal)?;
            }
            _ => {}
        }
    }
    sqlx::query(
        "update reports set status = $1, resolved_at = now(), resolved_by = $2
         where id = $3 and status = 'open'",
    )
    .bind(&payload.status)
    .bind(current.user.id)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true })))
}
