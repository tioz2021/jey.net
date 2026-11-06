//! Item repository over the local SQLite mirror.

use rusqlite::{OptionalExtension, Row, params};
use uuid::Uuid;

use jey_core::DomainError;
use jey_core::items::{Item, ItemKind, ItemPatch, ItemStatus, NewItem, validate};
use jey_core::repositories::ItemRepository;
use jey_core::sync::{DeviceId, Revision, SyncSeq, Timestamp};

use super::{DesktopStore, StoreError, now_millis};

pub(super) const COLUMNS: &str = "id, slug, user_id, kind, title, subtitle, year, status, rating,
    review, body, source_url, cover_key, public_hidden, external_source, external_id,
    details, details_fetched_at, revision, sync_seq, device_id, created_at, updated_at,
    deleted_at";

#[derive(Debug, Clone)]
pub struct SqliteItems {
    store: DesktopStore,
}

impl SqliteItems {
    pub fn new(store: DesktopStore) -> Self {
        Self { store }
    }

    pub fn store(&self) -> &DesktopStore {
        &self.store
    }
}

fn internal(error: impl std::error::Error + Send + Sync + 'static) -> DomainError {
    DomainError::internal(error)
}

pub(super) fn item_from_row(row: &Row<'_>) -> rusqlite::Result<Item> {
    let kind_raw: String = row.get(3)?;
    let status_raw: String = row.get(7)?;
    let details_raw: Option<String> = row.get(16)?;
    let device_raw: Option<String> = row.get(20)?;

    let parsed_kind = ItemKind::parse(&kind_raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    })?;
    let parsed_status = ItemStatus::parse(&status_raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(7, rusqlite::types::Type::Text, Box::new(error))
    })?;
    let details = details_raw
        .map(|raw| serde_json::from_str(&raw))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                16,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
    let device_id = device_raw
        .map(|raw| Uuid::parse_str(&raw))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                20,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?
        .map(DeviceId::from_uuid);

    Ok(Item {
        id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        slug: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        user_id: Uuid::parse_str(&row.get::<_, String>(2)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        kind: parsed_kind,
        title: row.get(4)?,
        subtitle: row.get(5)?,
        year: row.get(6)?,
        status: parsed_status,
        rating: row.get::<_, Option<i64>>(8)?.map(|value| value as u8),
        review: row.get(9)?,
        body: row.get(10)?,
        source_url: row.get(11)?,
        cover_key: row.get(12)?,
        public_hidden: row.get::<_, i64>(13)? != 0,
        external_source: row.get(14)?,
        external_id: row.get(15)?,
        details,
        details_fetched_at: row.get::<_, Option<i64>>(17)?.map(Timestamp::from_millis),
        revision: Revision::from_u64(row.get::<_, i64>(18)? as u64),
        sync_seq: SyncSeq::from_u64(row.get::<_, i64>(19)? as u64),
        device_id,
        created_at: Timestamp::from_millis(row.get(21)?),
        updated_at: Timestamp::from_millis(row.get(22)?),
        deleted_at: row.get::<_, Option<i64>>(23)?.map(Timestamp::from_millis),
    })
}

fn details_json(
    details: &Option<jey_core::items::MovieDetails>,
) -> Result<Option<String>, DomainError> {
    details
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(internal)
}

impl SqliteItems {
    /// Marks an item as waiting for sync. Editing offline overwrites the
    /// previous queued payload for the same item.
    fn enqueue(&self, item: &Item, deleted: bool) -> Result<(), DomainError> {
        let payload = if deleted {
            None
        } else {
            Some(serde_json::json!({
                "kind": item.kind.as_str(),
                "title": item.title,
                "subtitle": item.subtitle,
                "year": item.year,
                "status": item.status.as_str(),
                "rating": item.rating,
                "review": item.review,
                "body": item.body,
                "source_url": item.source_url,
                "cover_key": item.cover_key,
                "public_hidden": item.public_hidden,
                "external_source": item.external_source,
                "external_id": item.external_id,
                "details": item.details,
            }))
        };
        let connection = self.store.connection().map_err(internal)?;
        connection
            .execute(
                "insert into outbox
                    (entity, entity_id, revision, updated_at, deleted_at, payload, created_at)
                 values ('item', ?1, ?2, ?3, ?4, ?5, ?6)
                 on conflict (entity, entity_id) do update set
                    revision = excluded.revision,
                    updated_at = excluded.updated_at,
                    deleted_at = excluded.deleted_at,
                    payload = excluded.payload,
                    created_at = excluded.created_at",
                params![
                    item.id.to_string(),
                    item.revision.get() as i64,
                    item.updated_at.as_millis(),
                    item.deleted_at.map(|value| value.as_millis()),
                    payload.map(|value| value.to_string()),
                    now_millis()
                ],
            )
            .map_err(|error| internal(StoreError::Sql(error)))?;
        Ok(())
    }

    pub fn pending_ids(&self, user_id: Uuid) -> Result<Vec<String>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let mut statement = connection
            .prepare(
                "select o.entity_id from outbox o
                 join items i on i.id = o.entity_id
                 where i.user_id = ?1
                 order by o.updated_at desc",
            )
            .map_err(|error| internal(StoreError::Sql(error)))?;
        let rows = statement
            .query_map([user_id.to_string()], |row| row.get::<_, String>(0))
            .map_err(|error| internal(StoreError::Sql(error)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| internal(StoreError::Sql(error)))
    }

    /// Every local item, including tombstones. Used for a full export.
    pub fn all_items(&self, user_id: Uuid) -> Result<Vec<Item>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let sql = format!(
            "select {COLUMNS} from items where user_id = ?1 order by created_at asc, id asc"
        );
        let mut statement = connection
            .prepare(&sql)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        let rows = statement
            .query_map([user_id.to_string()], item_from_row)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| internal(StoreError::Sql(error)))
    }

    pub fn export_collections(&self, user_id: Uuid) -> Result<Vec<serde_json::Value>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let mut statement = connection
            .prepare(
                "select c.id, c.title, c.slug, c.visibility, c.created_at, c.updated_at,
                        coalesce((select group_concat(ci.item_id, ',')
                                  from collection_items ci
                                  where ci.collection_id = c.id), '') as item_ids
                 from collections c
                 where c.user_id = ?1
                 order by c.created_at asc, c.id asc",
            )
            .map_err(|error| internal(StoreError::Sql(error)))?;
        let rows = statement
            .query_map([user_id.to_string()], |row| {
                let ids: String = row.get(6)?;
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "title": row.get::<_, String>(1)?,
                    "slug": row.get::<_, String>(2)?,
                    "visibility": row.get::<_, String>(3)?,
                    "created_at": row.get::<_, i64>(4)?,
                    "updated_at": row.get::<_, i64>(5)?,
                    "item_ids": ids.split(',').filter(|value| !value.is_empty()).collect::<Vec<_>>(),
                }))
            })
            .map_err(|error| internal(StoreError::Sql(error)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| internal(StoreError::Sql(error)))
    }

    pub fn search_items(&self, user_id: Uuid, query: &str) -> Result<Vec<Item>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let pattern = format!("%{}%", query.trim());
        let sql = format!(
            "select {COLUMNS} from items
             where user_id = ?1 and deleted_at is null
               and (title like ?2 or coalesce(subtitle, '') like ?2 or coalesce(review, '') like ?2)
             order by updated_at desc, id desc"
        );
        let mut statement = connection
            .prepare(&sql)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        let rows = statement
            .query_map(params![user_id.to_string(), pattern], item_from_row)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| internal(StoreError::Sql(error)))
    }
}

impl ItemRepository for SqliteItems {
    async fn create_item(
        &self,
        user_id: Uuid,
        device_id: Option<DeviceId>,
        new: &NewItem,
    ) -> Result<Item, DomainError> {
        let new = validate::validate_new(new)?;
        if !validate::status_allowed(new.kind, new.status) {
            return Err(DomainError::validation_field(
                "status",
                "status is not allowed for this kind",
            ));
        }

        let id = Uuid::new_v4();
        let now = now_millis();
        let details = details_json(&new.details)?;
        {
            let connection = self.store.connection().map_err(internal)?;
            connection
                .execute(
                    "insert into items (
                    id, slug, user_id, kind, title, subtitle, year, status, rating,
                    review, body, source_url, cover_key, public_hidden, external_source,
                    external_id, details, details_fetched_at, revision, sync_seq,
                    device_id, created_at, updated_at
                 ) values (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, null, ?13,
                    ?14, ?15, ?16, ?17, 1, 0, ?18, ?19, ?20
                 )",
                    params![
                        id.to_string(),
                        id.to_string(),
                        user_id.to_string(),
                        new.kind.as_str(),
                        new.title,
                        new.subtitle,
                        new.year,
                        new.status.as_str(),
                        new.rating.map(i64::from),
                        new.review,
                        new.body,
                        new.source_url,
                        new.public_hidden,
                        new.external_source,
                        new.external_id,
                        details,
                        if new.details.is_some() {
                            Some(now)
                        } else {
                            None
                        },
                        device_id.map(|value| value.as_uuid().to_string()),
                        now,
                        now
                    ],
                )
                .map_err(|error| internal(StoreError::Sql(error)))?;
        }

        let item = self
            .get_item(user_id, id)
            .await?
            .ok_or_else(|| DomainError::internal("created item is not readable"))?;
        self.enqueue(&item, false)?;
        Ok(item)
    }

    async fn get_item(&self, user_id: Uuid, id: Uuid) -> Result<Option<Item>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let sql = format!(
            "select {COLUMNS} from items where id = ?1 and user_id = ?2 and deleted_at is null"
        );
        connection
            .query_row(
                &sql,
                params![id.to_string(), user_id.to_string()],
                item_from_row,
            )
            .optional()
            .map_err(|error| internal(StoreError::Sql(error)))
    }

    async fn update_item(
        &self,
        user_id: Uuid,
        id: Uuid,
        patch: &ItemPatch,
    ) -> Result<Option<Item>, DomainError> {
        let Some(current) = self.get_item(user_id, id).await? else {
            return Ok(None);
        };
        let patch = validate::validate_patch(patch)?;
        let now = now_millis();
        let title = patch.title.unwrap_or(current.title);
        let kind = patch.kind.unwrap_or(current.kind);
        let status = patch.status.unwrap_or(current.status);
        if !validate::status_allowed(kind, status) {
            return Err(DomainError::validation_field(
                "status",
                "status is not allowed for this kind",
            ));
        }
        let subtitle = patch.subtitle.or(current.subtitle);
        let year = patch.year.or(current.year);
        let rating = patch.rating.or(current.rating);
        let review = match patch.review {
            Some(value) if value.is_empty() => None,
            Some(value) => Some(value),
            None => current.review,
        };
        let body = match patch.body {
            Some(value) if value.is_empty() => None,
            Some(value) => Some(value),
            None => current.body,
        };
        let source_url = patch.source_url.or(current.source_url);
        let public_hidden = patch.public_hidden.unwrap_or(current.public_hidden);
        let external_source = patch.external_source.or(current.external_source);
        let external_id = patch.external_id.or(current.external_id);
        let details = patch.details.or(current.details);
        let details_json = details_json(&details)?;

        {
            let connection = self.store.connection().map_err(internal)?;
            connection
                .execute(
                    "update items set
                    kind = ?3, title = ?4, subtitle = ?5, year = ?6, status = ?7,
                    rating = ?8, review = ?9, body = ?10, source_url = ?11,
                    cover_key = ?12, public_hidden = ?13, external_source = ?14,
                    external_id = ?15, details = ?16, details_fetched_at = ?17,
                    revision = revision + 1, updated_at = ?18
                 where id = ?1 and user_id = ?2 and deleted_at is null",
                    params![
                        id.to_string(),
                        user_id.to_string(),
                        kind.as_str(),
                        title,
                        subtitle,
                        year,
                        status.as_str(),
                        rating.map(i64::from),
                        review,
                        body,
                        source_url,
                        current.cover_key,
                        public_hidden,
                        external_source,
                        external_id,
                        details_json,
                        if details.is_some() {
                            Some(now)
                        } else {
                            current.details_fetched_at.map(Timestamp::as_millis)
                        },
                        now
                    ],
                )
                .map_err(|error| internal(StoreError::Sql(error)))?;
        }

        let item = self.get_item(user_id, id).await?;
        if let Some(item) = &item {
            self.enqueue(item, false)?;
        }
        Ok(item)
    }

    async fn delete_item(&self, user_id: Uuid, id: Uuid) -> Result<bool, DomainError> {
        let current = self.get_item(user_id, id).await?;
        let Some(current) = current else {
            return Ok(false);
        };
        let now = now_millis();
        {
            let connection = self.store.connection().map_err(internal)?;
            connection
                .execute(
                    "update items set deleted_at = ?3, revision = revision + 1, updated_at = ?3
                     where id = ?1 and user_id = ?2 and deleted_at is null",
                    params![id.to_string(), user_id.to_string(), now],
                )
                .map_err(|error| internal(StoreError::Sql(error)))?;
        }
        let mut deleted = current;
        deleted.deleted_at = Some(Timestamp::from_millis(now));
        deleted.updated_at = Timestamp::from_millis(now);
        deleted.revision = deleted.revision.next();
        let _ = deleted;
        self.enqueue(&deleted, true)?;
        Ok(true)
    }

    async fn list_items(&self, user_id: Uuid) -> Result<Vec<Item>, DomainError> {
        let connection = self.store.connection().map_err(internal)?;
        let sql = format!(
            "select {COLUMNS} from items where user_id = ?1 and deleted_at is null
             order by updated_at desc, id desc"
        );
        let mut statement = connection
            .prepare(&sql)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        let rows = statement
            .query_map([user_id.to_string()], item_from_row)
            .map_err(|error| internal(StoreError::Sql(error)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| internal(StoreError::Sql(error)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn offline_mutations_are_queued_and_searchable() {
        let store = DesktopStore::in_memory().expect("store");
        let repository = SqliteItems::new(store);
        let user = Uuid::new_v4();
        let item = repository
            .create_item(
                user,
                None,
                &NewItem {
                    kind: ItemKind::Book,
                    title: "Offline searchable".to_owned(),
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

        assert_eq!(
            repository.pending_ids(user).unwrap(),
            vec![item.id.to_string()]
        );
        assert_eq!(
            repository.search_items(user, "searchable").unwrap().len(),
            1
        );

        let updated = repository
            .update_item(
                user,
                item.id,
                &ItemPatch {
                    title: Some("Offline edited".to_owned()),
                    ..ItemPatch::default()
                },
            )
            .await
            .expect("update")
            .expect("item");
        assert_eq!(updated.revision.get(), 2);
        assert_eq!(repository.pending_ids(user).unwrap().len(), 1);

        assert!(repository.delete_item(user, item.id).await.expect("delete"));
        assert_eq!(repository.pending_ids(user).unwrap().len(), 1);
        assert!(repository.list_items(user).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn passes_the_shared_contract() {
        let store = DesktopStore::in_memory().expect("store");
        let repository = SqliteItems::new(store);
        jey_repo_contract::exercise(&repository, Uuid::new_v4()).await;
    }
}
