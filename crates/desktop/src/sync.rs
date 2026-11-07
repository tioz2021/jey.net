//! Desktop synchronisation worker: register, push outbox, pull changes.
//!
//! The server contract is `docs/sync.md`. Local access, the local library and
//! the UI do not depend on this module succeeding.

use chrono::{DateTime, Utc};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::access::AccessStore;
use crate::session_store::SessionStore;
use crate::store::comments::CommentSyncRow;
use crate::store::{DesktopStore, RemoteChange};

const PROTOCOL: &str = "1";
const BATCH: usize = 100;

#[derive(Debug, Serialize)]
pub struct SyncReport {
    pub pushed: usize,
    pub pulled: usize,
    pub conflicts: usize,
    pub media: usize,
    pub last_seq: i64,
}

#[derive(Debug, Serialize)]
pub struct SyncStatusReport {
    pub last_seq: i64,
    pub changes_after: i64,
    pub server_time: String,
}

pub struct SyncService {
    server: String,
    user_id: Uuid,
    token: String,
    device_id: String,
    client: Client,
    store: DesktopStore,
}

impl SyncService {
    pub fn from_local(
        store: DesktopStore,
        access: &AccessStore,
        session: &SessionStore,
    ) -> Result<Self, String> {
        let grant = access
            .load()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Сначала войдите онлайн".to_owned())?;
        let token = session
            .load()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Нет сохранённой сессии, войдите снова".to_owned())?;
        let device_id = store.device_id().map_err(|error| error.to_string())?;
        Ok(Self {
            server: grant.server_url,
            user_id: grant.user_id,
            token,
            device_id,
            client: Client::new(),
            store,
        })
    }

    fn headers(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        request
            .header("Cookie", format!("jey_session={}", self.token))
            .header("Origin", &self.server)
            .header("X-Device-Id", &self.device_id)
            .header("X-Sync-Version", PROTOCOL)
    }

    async fn register(&self) -> Result<(), String> {
        let platform = match std::env::consts::OS {
            "linux" => "linux",
            "macos" => "macos",
            "windows" => "windows",
            _ => "linux",
        };
        let response = self
            .headers(self.client.post(format!("{}/api/v1/devices", self.server)))
            .json(&json!({
                "device_id": self.device_id,
                "name": "jey.net desktop",
                "platform": platform,
            }))
            .send()
            .await
            .map_err(|error| format!("Сервер недоступен: {error}"))?;
        if !response.status().is_success() {
            return Err(api_error(response).await);
        }
        Ok(())
    }

    pub async fn status(&self) -> Result<SyncStatusReport, String> {
        let since = self
            .store
            .last_sync_seq()
            .map_err(|error| error.to_string())?;
        let response = self
            .headers(
                self.client
                    .get(format!("{}/api/v1/sync/status?since={since}", self.server)),
            )
            .send()
            .await
            .map_err(|error| format!("Сервер недоступен: {error}"))?;
        if !response.status().is_success() {
            return Err(api_error(response).await);
        }
        let body: Value = response.json().await.map_err(|error| error.to_string())?;
        Ok(SyncStatusReport {
            last_seq: body.get("last_seq").and_then(Value::as_i64).unwrap_or(0),
            changes_after: body
                .get("changes_after")
                .and_then(Value::as_i64)
                .unwrap_or(0),
            server_time: body
                .get("server_time")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
        })
    }

    pub async fn synchronize(&self) -> Result<SyncReport, String> {
        self.register().await?;
        let mut pushed = 0;
        let mut conflicts = 0;

        loop {
            let rows = self
                .store
                .outbox_batch(BATCH)
                .map_err(|error| error.to_string())?;
            if rows.is_empty() {
                break;
            }
            let changes: Vec<Value> = rows
                .iter()
                .map(|row| {
                    let deleted = row.deleted_at.map(|value| {
                        DateTime::from_timestamp_millis(value)
                            .unwrap_or_else(Utc::now)
                            .to_rfc3339()
                    });
                    json!({
                        "entity": "item",
                        "id": row.id,
                        "revision": row.revision,
                        "updated_at": DateTime::from_timestamp_millis(row.updated_at)
                            .unwrap_or_else(Utc::now).to_rfc3339(),
                        "deleted_at": deleted,
                        "payload": row.payload.as_deref().and_then(|raw| serde_json::from_str::<Value>(raw).ok()),
                    })
                })
                .collect();
            let response = self
                .headers(
                    self.client
                        .post(format!("{}/api/v1/sync/push", self.server)),
                )
                .json(&json!({ "batch_id": Uuid::new_v4(), "changes": changes }))
                .send()
                .await
                .map_err(|error| format!("Сервер недоступен: {error}"))?;
            if !response.status().is_success() {
                return Err(api_error(response).await);
            }
            let body: Value = response.json().await.map_err(|error| error.to_string())?;
            let applied = body
                .get("applied")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let batch_conflicts = body
                .get("conflicts")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            pushed += applied.len();
            conflicts += batch_conflicts.len();
            let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
            self.store
                .clear_outbox(&ids)
                .map_err(|error| error.to_string())?;
            if rows.len() < BATCH {
                break;
            }
        }

        let mut pulled = 0;
        loop {
            let since = self
                .store
                .last_sync_seq()
                .map_err(|error| error.to_string())?;
            let response = self
                .headers(self.client.get(format!(
                    "{}/api/v1/sync/pull?since={since}&limit=200",
                    self.server
                )))
                .send()
                .await
                .map_err(|error| format!("Сервер недоступен: {error}"))?;
            if !response.status().is_success() {
                return Err(api_error(response).await);
            }
            let body: Value = response.json().await.map_err(|error| error.to_string())?;
            let changes = body
                .get("changes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for change in &changes {
                let Some(id) = change
                    .get("id")
                    .and_then(Value::as_str)
                    .and_then(|value| Uuid::parse_str(value).ok())
                else {
                    continue;
                };
                let revision = change.get("revision").and_then(Value::as_i64).unwrap_or(1);
                let sync_seq = change
                    .get("sync_seq")
                    .and_then(Value::as_i64)
                    .unwrap_or(since);
                let updated_at = change
                    .get("updated_at")
                    .and_then(Value::as_str)
                    .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                    .map(|value| value.timestamp_millis())
                    .unwrap_or_else(|| Utc::now().timestamp_millis());
                let deleted_at = change
                    .get("deleted_at")
                    .and_then(Value::as_str)
                    .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                    .map(|value| value.timestamp_millis());
                let payload = change.get("payload").filter(|value| !value.is_null());
                if self
                    .store
                    .apply_remote(
                        self.user_id,
                        RemoteChange {
                            id,
                            revision,
                            sync_seq,
                            updated_at,
                            deleted_at,
                            payload,
                        },
                    )
                    .map_err(|error| error.to_string())?
                {
                    pulled += 1;
                }
            }
            let next = body
                .get("next_since")
                .and_then(Value::as_i64)
                .unwrap_or(since);
            self.store
                .set_sync_seq(next)
                .map_err(|error| error.to_string())?;
            let has_more = body
                .get("has_more")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if !has_more || changes.is_empty() {
                break;
            }
        }

        if let Err(error) = self.sync_social().await {
            eprintln!("social sync skipped: {error}");
        }
        let media = self.cache_media().await?;
        let last_seq = self
            .store
            .last_sync_seq()
            .map_err(|error| error.to_string())?;
        Ok(SyncReport {
            pushed,
            pulled,
            conflicts,
            media,
            last_seq,
        })
    }

    async fn sync_social(&self) -> Result<(), String> {
        for (id, title, visibility) in self
            .store
            .collections_for_sync(self.user_id)
            .map_err(|error| error.to_string())?
        {
            let response = self
                .headers(
                    self.client
                        .post(format!("{}/api/v1/collections", self.server)),
                )
                .json(&json!({ "id": id, "title": title, "visibility": visibility }))
                .send()
                .await
                .map_err(|error| error.to_string())?;
            if !response.status().is_success() && response.status() != StatusCode::CONFLICT {
                return Err(api_error(response).await);
            }
            for item_id in self
                .store
                .collection_item_ids(self.user_id, &id)
                .map_err(|error| error.to_string())?
            {
                let response = self
                    .headers(self.client.put(format!(
                        "{}/api/v1/collections/{id}/items/{item_id}",
                        self.server
                    )))
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;
                if !response.status().is_success() && response.status() != StatusCode::CONFLICT {
                    return Err(api_error(response).await);
                }
            }
        }
        for comment in self
            .store
            .comments_for_sync(self.user_id)
            .map_err(|error| error.to_string())?
        {
            let CommentSyncRow {
                id,
                item_id,
                parent_id,
                body,
            } = comment;
            let response = self
                .headers(self.client.post(format!(
                    "{}/api/v1/public/users/{}/items/{item_id}/comments",
                    self.server, self.user_id
                )))
                .json(&json!({ "id": id, "body": body, "parent_id": parent_id }))
                .send()
                .await
                .map_err(|error| error.to_string())?;
            if !response.status().is_success() && response.status() != StatusCode::CONFLICT {
                return Err(api_error(response).await);
            }
        }
        Ok(())
    }

    async fn cache_media(&self) -> Result<usize, String> {
        let keys = self
            .store
            .cover_keys(self.user_id)
            .map_err(|error| error.to_string())?;
        let mut downloaded = 0;
        for key in keys {
            if self
                .store
                .media_cached(&key)
                .map_err(|error| error.to_string())?
            {
                continue;
            }
            let response = self
                .headers(self.client.get(format!("{}/media/{key}", self.server)))
                .send()
                .await
                .map_err(|error| format!("Медиа недоступно: {error}"))?;
            if response.status() == StatusCode::NOT_FOUND {
                continue;
            }
            if !response.status().is_success() {
                return Err(api_error(response).await);
            }
            let bytes = response.bytes().await.map_err(|error| error.to_string())?;
            self.store
                .write_media(&key, &bytes)
                .map_err(|error| error.to_string())?;
            downloaded += 1;
        }
        Ok(downloaded)
    }
}

async fn api_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    let message = body
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("Ошибка синхронизации");
    if status == StatusCode::UNAUTHORIZED {
        format!("Сессия истекла, войдите снова: {message}")
    } else {
        format!("{message} ({status})")
    }
}
