//! Local side of the sync protocol: outbox, remote apply and cursors.

use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use super::{DesktopStore, StoreError, now_millis};

#[derive(Debug, Clone)]
pub struct RemoteChange<'a> {
    pub id: Uuid,
    pub revision: i64,
    pub sync_seq: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub payload: Option<&'a Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutboxRow {
    pub id: String,
    pub revision: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub payload: Option<String>,
}

impl DesktopStore {
    pub fn setting(&self, key: &str) -> Result<Option<String>, StoreError> {
        let connection = self.connection()?;
        Ok(connection
            .query_row(
                "select value from local_settings where key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "insert into local_settings (key, value) values (?1, ?2)
             on conflict (key) do update set value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn device_id(&self) -> Result<String, StoreError> {
        if let Some(value) = self.setting("device_id")? {
            return Ok(value);
        }
        let value = Uuid::new_v4().to_string();
        self.set_setting("device_id", &value)?;
        Ok(value)
    }

    pub fn outbox_batch(&self, limit: usize) -> Result<Vec<OutboxRow>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select entity_id, revision, updated_at, deleted_at, payload
             from outbox order by created_at asc limit ?1",
        )?;
        let rows = statement.query_map([limit as i64], |row| {
            Ok(OutboxRow {
                id: row.get(0)?,
                revision: row.get(1)?,
                updated_at: row.get(2)?,
                deleted_at: row.get(3)?,
                payload: row.get(4)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }

    pub fn clear_outbox(&self, ids: &[String]) -> Result<(), StoreError> {
        let connection = self.connection()?;
        for id in ids {
            connection.execute(
                "delete from outbox where entity = 'item' and entity_id = ?1",
                [id],
            )?;
        }
        Ok(())
    }

    pub fn pending_for(&self, id: &str) -> Result<bool, StoreError> {
        let connection = self.connection()?;
        Ok(connection.query_row(
            "select exists(select 1 from outbox where entity = 'item' and entity_id = ?1)",
            [id],
            |row| row.get::<_, i64>(0),
        )? != 0)
    }

    /// Applies one item from `pull` without creating an outbox entry.
    /// Returns false when a local unsent edit owns the item.
    pub fn apply_remote(
        &self,
        user_id: Uuid,
        change: RemoteChange<'_>,
    ) -> Result<bool, StoreError> {
        let RemoteChange {
            id,
            revision,
            sync_seq,
            updated_at,
            deleted_at,
            payload,
        } = change;
        if self.pending_for(&id.to_string())? {
            return Ok(false);
        }
        let now = now_millis();
        let (
            kind,
            title,
            subtitle,
            year,
            status,
            rating,
            review,
            body,
            source_url,
            cover_key,
            public_hidden,
            external_source,
            external_id,
            details,
        ) = match payload {
            Some(value) => (
                value.get("kind").and_then(Value::as_str).unwrap_or("movie"),
                value
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("Без названия"),
                value.get("subtitle").and_then(Value::as_str),
                value.get("year").and_then(Value::as_i64).map(|v| v as i32),
                value
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("planned"),
                value
                    .get("rating")
                    .and_then(Value::as_u64)
                    .map(|v| v as i64),
                value.get("review").and_then(Value::as_str),
                value.get("body").and_then(Value::as_str),
                value.get("source_url").and_then(Value::as_str),
                value.get("cover_key").and_then(Value::as_str),
                value
                    .get("public_hidden")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                value.get("external_source").and_then(Value::as_str),
                value.get("external_id").and_then(Value::as_str),
                value
                    .get("details")
                    .filter(|value| !value.is_null())
                    .map(Value::to_string),
            ),
            None => (
                "movie",
                "Удалённая запись",
                None,
                None,
                "done",
                None,
                None,
                None,
                None,
                None,
                false,
                None,
                None,
                None,
            ),
        };
        let connection = self.connection()?;
        connection.execute(
            "insert into items
                (id, slug, user_id, kind, title, subtitle, year, status, rating, review, body,
                 source_url, cover_key, public_hidden, external_source, external_id, details,
                 revision, sync_seq, created_at, updated_at, deleted_at)
             values (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                     ?15, ?16, ?17, ?18, ?19, ?20, ?21)
             on conflict (id) do update set
                kind = excluded.kind, title = excluded.title, subtitle = excluded.subtitle,
                year = excluded.year, status = excluded.status, rating = excluded.rating,
                review = excluded.review, body = excluded.body, source_url = excluded.source_url,
                cover_key = excluded.cover_key, public_hidden = excluded.public_hidden,
                external_source = excluded.external_source, external_id = excluded.external_id,
                details = excluded.details, revision = excluded.revision,
                sync_seq = excluded.sync_seq, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at",
            params![
                id.to_string(),
                user_id.to_string(),
                kind,
                title,
                subtitle,
                year,
                status,
                rating,
                review,
                body,
                source_url,
                cover_key,
                public_hidden as i64,
                external_source,
                external_id,
                details,
                revision,
                sync_seq,
                now,
                updated_at,
                deleted_at
            ],
        )?;
        drop(connection);
        self.set_sync_seq(sync_seq)?;
        Ok(true)
    }

    pub fn set_sync_seq(&self, seq: i64) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "update sync_state set last_sync_seq = ?1, updated_at = ?2 where id = 1",
            params![seq, now_millis()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::SqliteItems;
    use jey_core::items::{ItemKind, ItemStatus, NewItem};
    use jey_core::repositories::ItemRepository;

    #[tokio::test]
    async fn remote_apply_does_not_enqueue_and_advances_cursor() {
        let store = DesktopStore::in_memory().expect("store");
        let user = Uuid::new_v4();
        let repo = SqliteItems::new(store.clone());
        let item = repo
            .create_item(
                user,
                None,
                &NewItem {
                    kind: ItemKind::Movie,
                    title: "Remote".to_owned(),
                    subtitle: None,
                    year: None,
                    status: ItemStatus::Done,
                    rating: Some(8),
                    review: None,
                    body: None,
                    source_url: None,
                    external_source: None,
                    external_id: None,
                    details: None,
                    public_hidden: false,
                },
            )
            .await
            .expect("create");
        store.clear_outbox(&[item.id.to_string()]).unwrap();

        let payload = serde_json::json!({
            "kind": "movie", "title": "Remote edited", "status": "done", "rating": 9
        });
        assert!(
            store
                .apply_remote(
                    user,
                    RemoteChange {
                        id: item.id,
                        revision: 2,
                        sync_seq: 42,
                        updated_at: 1_700_000_000_000,
                        deleted_at: None,
                        payload: Some(&payload),
                    },
                )
                .unwrap()
        );
        assert!(!store.pending_for(&item.id.to_string()).unwrap());
        assert_eq!(store.last_sync_seq().unwrap(), 42);
        let loaded = repo.get_item(user, item.id).await.unwrap().unwrap();
        assert_eq!(loaded.title, "Remote edited");
        assert_eq!(loaded.revision.get(), 2);
    }

    #[tokio::test]
    async fn pending_local_edit_wins_over_incoming_remote() {
        let store = DesktopStore::in_memory().expect("store");
        let user = Uuid::new_v4();
        let repo = SqliteItems::new(store.clone());
        let item = repo
            .create_item(
                user,
                None,
                &NewItem {
                    kind: ItemKind::Book,
                    title: "Local".to_owned(),
                    subtitle: None,
                    year: None,
                    status: ItemStatus::Planned,
                    rating: None,
                    review: None,
                    body: None,
                    source_url: None,
                    external_source: None,
                    external_id: None,
                    details: None,
                    public_hidden: false,
                },
            )
            .await
            .expect("create");
        assert!(store.pending_for(&item.id.to_string()).unwrap());

        let payload = serde_json::json!({ "kind": "book", "title": "Remote", "status": "done" });
        assert!(
            !store
                .apply_remote(
                    user,
                    RemoteChange {
                        id: item.id,
                        revision: 2,
                        sync_seq: 12,
                        updated_at: 1_700_000_000_000,
                        deleted_at: None,
                        payload: Some(&payload),
                    },
                )
                .unwrap()
        );
        let loaded = repo.get_item(user, item.id).await.unwrap().unwrap();
        assert_eq!(loaded.title, "Local");
    }
}
