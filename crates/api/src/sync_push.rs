//! `POST /api/v1/sync/push` — apply a batch of client changes.
//!
//! The contract is frozen in `docs/sync.md`. This handler owns the server side
//! of the merge: it validates ownership, calls the shared pure merge rule,
//! stores losing versions as conflicts and lets the item trigger assign
//! `sync_seq`.

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, Postgres, Transaction};
use uuid::Uuid;

use jey_core::items::{ItemKind, ItemStatus, NewItem, validate};
use jey_core::sync::{ChangeState, DeviceId, MergeOutcome, Revision, Timestamp, merge};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

const MAX_CHANGES: usize = 500;
const PROTOCOL_VERSION: i64 = 1;

#[derive(Debug, Deserialize)]
pub struct PushRequest {
    pub batch_id: Uuid,
    pub changes: Vec<Change>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Change {
    pub entity: String,
    pub id: Uuid,
    pub revision: i64,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct SyncPayload {
    kind: ItemKind,
    title: String,
    #[serde(default)]
    subtitle: Option<String>,
    #[serde(default)]
    year: Option<i32>,
    status: ItemStatus,
    #[serde(default)]
    rating: Option<u8>,
    #[serde(default)]
    review: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    cover_key: Option<String>,
    #[serde(default)]
    details: Option<Value>,
    #[serde(default)]
    public_hidden: bool,
    #[serde(default)]
    external_source: Option<String>,
    #[serde(default)]
    external_id: Option<String>,
}

#[derive(Debug, FromRow)]
struct StoredItem {
    user_id: Uuid,
    revision: i64,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    device_id: Option<Uuid>,
    snapshot: Value,
}

fn header_uuid(headers: &HeaderMap, name: &str) -> Result<Uuid, AppError> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| AppError::validation_field(name, format!("{name} must be a UUID")))
}

fn check_version(headers: &HeaderMap) -> Result<(), AppError> {
    let version = headers
        .get("x-sync-version")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::validation_field("X-Sync-Version", "sync version is required"))?;
    if version != "1" {
        return Err(AppError::validation_field(
            "X-Sync-Version",
            "unsupported sync version",
        ));
    }
    Ok(())
}

type CleanItem = (
    NewItem,
    Option<String>,
    Option<Value>,
    bool,
    Option<String>,
    Option<String>,
);

fn clean_payload(payload: &Value) -> Result<CleanItem, AppError> {
    let parsed: SyncPayload = serde_json::from_value(payload.clone())
        .map_err(|error| AppError::validation(format!("invalid item payload: {error}")))?;

    let new = NewItem {
        kind: parsed.kind,
        title: parsed.title,
        subtitle: parsed.subtitle,
        year: parsed.year,
        status: parsed.status,
        rating: parsed.rating,
        review: parsed.review,
        body: parsed.body,
        source_url: parsed.source_url,
        external_source: parsed.external_source.clone(),
        external_id: parsed.external_id.clone(),
        details: None,
        public_hidden: parsed.public_hidden,
    };
    let new = validate::validate_new(&new)?;
    if !validate::status_allowed(new.kind, new.status) {
        return Err(AppError::validation_field(
            "status",
            "status is not allowed for this kind",
        ));
    }

    if let Some(cover_key) = parsed.cover_key.as_deref()
        && (cover_key.is_empty() || cover_key.len() > 512)
    {
        return Err(AppError::validation_field("cover_key", "invalid cover key"));
    }

    Ok((
        new,
        parsed.cover_key,
        parsed.details,
        parsed.public_hidden,
        parsed.external_source,
        parsed.external_id,
    ))
}

async fn stored_item(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<StoredItem>, AppError> {
    sqlx::query_as::<_, StoredItem>(
        "select i.user_id, i.revision, i.updated_at, i.deleted_at, i.device_id,
                to_jsonb(i) as snapshot
         from items i where i.id = $1",
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(AppError::internal)
}

async fn load_external_device(
    tx: &mut Transaction<'_, Postgres>,
    internal: Option<Uuid>,
) -> Result<DeviceId, AppError> {
    let Some(internal) = internal else {
        return Ok(DeviceId::from_uuid(Uuid::nil()));
    };
    let external: Option<Uuid> =
        sqlx::query_scalar("select installation_id from devices where id = $1")
            .bind(internal)
            .fetch_optional(&mut **tx)
            .await
            .map_err(AppError::internal)?;
    Ok(DeviceId::from_uuid(external.unwrap_or(Uuid::nil())))
}

pub(crate) async fn apply_payload(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    change: &Change,
    device_internal: Uuid,
    existing: bool,
) -> Result<i64, AppError> {
    let deleted = change.deleted_at.is_some();
    let (new, cover_key, details, public_hidden, external_source, external_id) = if deleted {
        (None, None, None, false, None, None)
    } else {
        let payload = change.payload.as_ref().ok_or_else(|| {
            AppError::validation_field("payload", "payload is required for a live item")
        })?;
        let (new, cover, details, hidden, source, external) = clean_payload(payload)?;
        (Some(new), cover, details, hidden, source, external)
    };

    let updated_at = change.updated_at;
    let deleted_at = change.deleted_at;

    let sync_seq: i64 = if existing {
        if let Some(new) = new {
            sqlx::query_scalar(
                "update items set
                    kind = $3, title = $4, subtitle = $5, year = $6,
                    status = $7, rating = $8, review = $9, body = $10,
                    source_url = $11, cover_key = $12, details = $13,
                    public_hidden = $14, external_source = $15, external_id = $16,
                    revision = $17, updated_at = $18, deleted_at = $19, device_id = $20
                 where id = $1 and user_id = $2
                 returning sync_seq",
            )
            .bind(change.id)
            .bind(user_id)
            .bind(new.kind.as_str())
            .bind(&new.title)
            .bind(&new.subtitle)
            .bind(new.year)
            .bind(new.status.as_str())
            .bind(new.rating.map(i16::from))
            .bind(&new.review)
            .bind(&new.body)
            .bind(&new.source_url)
            .bind(&cover_key)
            .bind(&details)
            .bind(public_hidden)
            .bind(&external_source)
            .bind(&external_id)
            .bind(change.revision)
            .bind(updated_at)
            .bind(deleted_at)
            .bind(device_internal)
            .fetch_one(&mut **tx)
            .await
            .map_err(AppError::internal)?
        } else {
            sqlx::query_scalar(
                "update items set
                    revision = $3, updated_at = $4, deleted_at = $5, device_id = $6
                 where id = $1 and user_id = $2
                 returning sync_seq",
            )
            .bind(change.id)
            .bind(user_id)
            .bind(change.revision)
            .bind(updated_at)
            .bind(deleted_at)
            .bind(device_internal)
            .fetch_one(&mut **tx)
            .await
            .map_err(AppError::internal)?
        }
    } else {
        let new = new.ok_or_else(|| {
            AppError::validation("cannot delete an item the server has never seen")
        })?;
        sqlx::query_scalar(
            "insert into items (
                id, user_id, kind, title, subtitle, year, status, rating,
                review, body, source_url, cover_key, details, public_hidden,
                external_source, external_id, revision, updated_at, deleted_at, device_id
             ) values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20
             ) returning sync_seq",
        )
        .bind(change.id)
        .bind(user_id)
        .bind(new.kind.as_str())
        .bind(&new.title)
        .bind(&new.subtitle)
        .bind(new.year)
        .bind(new.status.as_str())
        .bind(new.rating.map(i16::from))
        .bind(&new.review)
        .bind(&new.body)
        .bind(&new.source_url)
        .bind(&cover_key)
        .bind(&details)
        .bind(public_hidden)
        .bind(&external_source)
        .bind(&external_id)
        .bind(change.revision)
        .bind(updated_at)
        .bind(deleted_at)
        .bind(device_internal)
        .fetch_one(&mut **tx)
        .await
        .map_err(AppError::internal)?
    };

    Ok(sync_seq)
}

pub async fn push(
    State(state): State<AppState>,
    current: CurrentUser,
    headers: HeaderMap,
    Json(request): Json<PushRequest>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    check_version(&headers)?;
    let external_device = header_uuid(&headers, "x-device-id")?;
    if request.changes.len() > MAX_CHANGES {
        return Err(AppError::validation_field(
            "changes",
            format!("a batch may contain at most {MAX_CHANGES} changes"),
        ));
    }
    if request.changes.is_empty() {
        return Err(AppError::validation_field(
            "changes",
            "changes must not be empty",
        ));
    }

    let mut tx = state.pool.begin().await.map_err(AppError::internal)?;
    let device_internal: Option<Uuid> =
        sqlx::query_scalar("select id from devices where user_id = $1 and installation_id = $2")
            .bind(current.user.id)
            .bind(external_device)
            .fetch_optional(&mut *tx)
            .await
            .map_err(AppError::internal)?;
    let Some(device_internal) = device_internal else {
        return Err(AppError::validation_field("X-Device-Id", "unknown_device"));
    };

    let cached: Option<Value> = sqlx::query_scalar(
        "select response from sync_batches
         where user_id = $1 and device_id = $2 and batch_id = $3",
    )
    .bind(current.user.id)
    .bind(device_internal)
    .bind(request.batch_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(AppError::internal)?;
    if let Some(response) = cached {
        tx.commit().await.map_err(AppError::internal)?;
        return Ok((StatusCode::OK, Json(response)));
    }

    let incoming_device = DeviceId::from_uuid(external_device);
    // A clock more than five minutes ahead is normalised to server time.
    let now = Utc::now();
    let mut applied = Vec::new();
    let mut conflicts = Vec::new();

    for change in &request.changes {
        if change.entity != "item" {
            return Err(AppError::validation_field(
                "entity",
                "only item entities are supported in sync v1",
            ));
        }
        if change.revision < 1 {
            return Err(AppError::validation_field(
                "revision",
                "revision must be positive",
            ));
        }
        let updated_at = if change.updated_at > now + chrono::Duration::minutes(5) {
            now
        } else {
            change.updated_at
        };
        let normalized = Change {
            updated_at,
            ..change.clone()
        };

        let stored = stored_item(&mut tx, change.id).await?;
        if let Some(row) = &stored
            && row.user_id != current.user.id
        {
            return Err(AppError::forbidden("item belongs to another account"));
        }

        if let Some(row) = stored {
            let stored_device = load_external_device(&mut tx, row.device_id).await?;
            let stored_state = ChangeState::new(
                Revision::from_u64(row.revision as u64),
                Timestamp::from_millis(row.updated_at.timestamp_millis()),
                stored_device,
                row.deleted_at.is_some(),
            );
            let incoming_state = ChangeState::new(
                Revision::from_u64(normalized.revision as u64),
                Timestamp::from_millis(normalized.updated_at.timestamp_millis()),
                incoming_device,
                normalized.deleted_at.is_some(),
            );
            match merge(&stored_state, &incoming_state) {
                MergeOutcome::Duplicate => continue,
                MergeOutcome::KeepStored => {
                    let conflict_id = Uuid::new_v4();
                    let incoming_json =
                        serde_json::to_value(&normalized).map_err(AppError::internal)?;
                    sqlx::query(
                        "insert into sync_conflicts
                         (id, user_id, item_id, device_id, reason, incoming, stored)
                         values ($1, $2, $3, $4, 'stale_revision', $5, $6)",
                    )
                    .bind(conflict_id)
                    .bind(current.user.id)
                    .bind(change.id)
                    .bind(device_internal)
                    .bind(&incoming_json)
                    .bind(&row.snapshot)
                    .execute(&mut *tx)
                    .await
                    .map_err(AppError::internal)?;
                    conflicts.push(json!({
                        "entity": "item",
                        "id": change.id,
                        "reason": "stale_revision",
                        "conflict_id": conflict_id,
                    }));
                    continue;
                }
                MergeOutcome::TakeIncoming => {}
            }
            let sync_seq =
                apply_payload(&mut tx, current.user.id, &normalized, device_internal, true).await?;
            applied.push(json!({
                "entity": "item",
                "id": change.id,
                "revision": normalized.revision,
                "sync_seq": sync_seq,
            }));
        } else {
            // A create+delete can happen before the first push. There is
            // nothing to tombstone, so ignoring it is safer than failing the
            // whole batch and blocking every later local change.
            if normalized.deleted_at.is_some() {
                continue;
            }
            let sync_seq = apply_payload(
                &mut tx,
                current.user.id,
                &normalized,
                device_internal,
                false,
            )
            .await?;
            applied.push(json!({
                "entity": "item",
                "id": change.id,
                "revision": normalized.revision,
                "sync_seq": sync_seq,
            }));
        }
    }

    sqlx::query("update devices set last_seen_at = now() where id = $1")
        .bind(device_internal)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;
    sqlx::query("update sessions set device_id = $1 where id = $2")
        .bind(device_internal)
        .bind(current.session_id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::internal)?;

    let last_seq: i64 = sqlx::query_scalar("select sync_seq from users where id = $1")
        .bind(current.user.id)
        .fetch_one(&mut *tx)
        .await
        .map_err(AppError::internal)?;

    let response = json!({
        "protocol_version": PROTOCOL_VERSION,
        "applied": applied,
        "conflicts": conflicts,
        "last_seq": last_seq,
    });
    sqlx::query(
        "insert into sync_batches (user_id, device_id, batch_id, response)
         values ($1, $2, $3, $4)",
    )
    .bind(current.user.id)
    .bind(device_internal)
    .bind(request.batch_id)
    .bind(&response)
    .execute(&mut *tx)
    .await
    .map_err(AppError::internal)?;
    tx.commit().await.map_err(AppError::internal)?;

    Ok((StatusCode::OK, Json(response)))
}
