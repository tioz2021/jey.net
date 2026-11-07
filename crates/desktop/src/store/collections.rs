//! Local collections. They are intentionally local in 0.3; the server sync
//! contract currently covers items only.

use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

use super::{DesktopStore, StoreError};

#[derive(Debug, Clone, Serialize)]
pub struct CollectionSummary {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub visibility: String,
    pub created_at: String,
    pub item_count: i64,
}

impl DesktopStore {
    pub fn list_collections(&self, user_id: Uuid) -> Result<Vec<CollectionSummary>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select c.id, c.title, c.slug, c.visibility, c.created_at,
                    (select count(*) from collection_items ci where ci.collection_id = c.id)
             from collections c
             where c.user_id = ?1 and c.deleted_at is null
             order by c.created_at desc",
        )?;
        let rows = statement.query_map([user_id.to_string()], |row| {
            let created_at: i64 = row.get(4)?;
            Ok(CollectionSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                slug: row.get(2)?,
                visibility: row.get(3)?,
                created_at: created_at.to_string(),
                item_count: row.get(5)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }

    pub fn create_collection(
        &self,
        user_id: Uuid,
        title: &str,
    ) -> Result<CollectionSummary, StoreError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(StoreError::Invalid("empty collection title".to_owned()));
        }
        let id = Uuid::new_v4();
        let slug = format!("local-{}", &id.to_string()[..8]);
        let now = super::now_millis();
        let connection = self.connection()?;
        connection.execute(
            "insert into collections (id, user_id, title, slug, visibility, created_at, updated_at)
             values (?1, ?2, ?3, ?4, 'private', ?5, ?5)",
            params![id.to_string(), user_id.to_string(), title, slug, now],
        )?;
        Ok(CollectionSummary {
            id: id.to_string(),
            title: title.to_owned(),
            slug,
            visibility: "private".to_owned(),
            created_at: now.to_string(),
            item_count: 0,
        })
    }

    pub fn update_collection(
        &self,
        user_id: Uuid,
        id: &str,
        title: Option<&str>,
        visibility: Option<&str>,
    ) -> Result<(), StoreError> {
        let connection = self.connection()?;
        let now = super::now_millis();
        if let Some(title) = title {
            connection.execute(
                "update collections set title = ?3, updated_at = ?4 where id = ?1 and user_id = ?2 and deleted_at is null",
                params![id, user_id.to_string(), title.trim(), now],
            )?;
        }
        if let Some(visibility) = visibility {
            connection.execute(
                "update collections set visibility = ?3, updated_at = ?4 where id = ?1 and user_id = ?2 and deleted_at is null",
                params![id, user_id.to_string(), visibility, now],
            )?;
        }
        Ok(())
    }

    pub fn delete_collection(&self, user_id: Uuid, id: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "update collections set deleted_at = ?3, updated_at = ?3 where id = ?1 and user_id = ?2",
            params![id, user_id.to_string(), super::now_millis()],
        )?;
        Ok(())
    }
}

impl DesktopStore {
    pub fn collection_item_ids(&self, user_id: Uuid, id: &str) -> Result<Vec<Uuid>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select ci.item_id from collection_items ci
             join collections c on c.id = ci.collection_id
             where ci.collection_id = ?1 and c.user_id = ?2 and c.deleted_at is null",
        )?;
        let rows = statement.query_map(params![id, user_id.to_string()], |row| {
            row.get::<_, String>(0)
        })?;
        rows.collect::<rusqlite::Result<Vec<String>>>()
            .map_err(StoreError::Sql)?
            .into_iter()
            .map(|value| {
                Uuid::parse_str(&value).map_err(|error| StoreError::Invalid(error.to_string()))
            })
            .collect()
    }
}

pub struct CollectionSyncRow {
    pub id: String,
    pub title: String,
    pub visibility: String,
    pub deleted_at: Option<i64>,
}

impl DesktopStore {
    pub fn collections_for_sync(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<CollectionSyncRow>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select id, title, visibility, deleted_at from collections where user_id = ?1 order by created_at asc",
        )?;
        let rows = statement.query_map([user_id.to_string()], |row| {
            Ok(CollectionSyncRow {
                id: row.get(0)?,
                title: row.get(1)?,
                visibility: row.get(2)?,
                deleted_at: row.get(3)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }
}

impl DesktopStore {
    pub fn upsert_collection(
        &self,
        user_id: Uuid,
        id: &str,
        title: &str,
        slug: &str,
        visibility: &str,
        created_at: i64,
    ) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "insert into collections (id, user_id, title, slug, visibility, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             on conflict(id) do update set title = excluded.title, slug = excluded.slug,
               visibility = excluded.visibility, updated_at = excluded.updated_at, deleted_at = null",
            params![id, user_id.to_string(), title, slug, visibility, created_at],
        )?;
        Ok(())
    }
}

impl DesktopStore {
    pub fn purge_collection(&self, user_id: Uuid, id: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "delete from collections where id = ?1 and user_id = ?2",
            params![id, user_id.to_string()],
        )?;
        Ok(())
    }
}
