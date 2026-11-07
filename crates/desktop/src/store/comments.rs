//! Local comments for the offline catalogue.

use rusqlite::params;
use serde_json::{Value, json};
use uuid::Uuid;

use super::{DesktopStore, StoreError};

pub struct CommentSyncRow {
    pub id: String,
    pub item_id: String,
    pub parent_id: Option<String>,
    pub body: String,
    pub deleted_at: Option<i64>,
}

impl DesktopStore {
    pub fn list_comments(
        &self,
        user_id: Uuid,
        item_id: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Value, StoreError> {
        let connection = self.connection()?;
        let total: i64 = connection.query_row(
            "select count(*) from comments where item_id = ?1 and deleted_at is null",
            [item_id],
            |row| row.get(0),
        )?;
        let mut statement = connection.prepare(
            "select id, body, created_at, user_id from comments
             where item_id = ?1 and deleted_at is null and parent_id is null
             order by created_at desc limit ?2 offset ?3",
        )?;
        let rows = statement.query_map(params![item_id, limit + 1, offset], |row| {
            let id: String = row.get(0)?;
            let body: String = row.get(1)?;
            let created_at: i64 = row.get(2)?;
            let author: String = row.get(3)?;
            Ok(json!({
                "id": id, "parent_id": null, "body": body,
                "created_at": created_at.to_string(), "author_id": author,
                "author_name": "Вы", "author_avatar": null,
                "like_count": 0, "liker_ids": [], "replies": [],
            }))
        })?;
        let mut comments = rows
            .collect::<rusqlite::Result<Vec<Value>>>()
            .map_err(StoreError::Sql)?;
        let has_more = comments.len() as i64 > limit;
        if has_more {
            comments.truncate(limit as usize);
        }
        let _ = user_id;
        Ok(
            json!({ "comments": comments, "total": total, "next_offset": has_more.then_some(offset + limit) }),
        )
    }

    pub fn create_comment(
        &self,
        user_id: Uuid,
        item_id: &str,
        body: &str,
        parent_id: Option<&str>,
    ) -> Result<String, StoreError> {
        let id = Uuid::new_v4().to_string();
        let connection = self.connection()?;
        connection.execute(
            "insert into comments (id, user_id, item_id, parent_id, body, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                user_id.to_string(),
                item_id,
                parent_id,
                body,
                super::now_millis()
            ],
        )?;
        Ok(id)
    }

    pub fn delete_comment(&self, user_id: Uuid, id: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "update comments set deleted_at = ?3 where id = ?1 and user_id = ?2",
            params![id, user_id.to_string(), super::now_millis()],
        )?;
        Ok(())
    }
}

impl DesktopStore {
    pub fn comments_for_sync(&self, user_id: Uuid) -> Result<Vec<CommentSyncRow>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select id, item_id, parent_id, body, deleted_at from comments
             where user_id = ?1 order by created_at asc",
        )?;
        let rows = statement.query_map([user_id.to_string()], |row| {
            Ok(CommentSyncRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                parent_id: row.get(2)?,
                body: row.get(3)?,
                deleted_at: row.get(4)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }
}

impl DesktopStore {
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_comment(
        &self,
        id: &str,
        user_id: &str,
        item_id: &str,
        parent_id: Option<&str>,
        body: &str,
        created_at: i64,
        deleted_at: Option<i64>,
    ) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "insert into comments (id, user_id, item_id, parent_id, body, created_at, deleted_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(id) do update set body = excluded.body,
               parent_id = excluded.parent_id, deleted_at = excluded.deleted_at",
            params![
                id, user_id, item_id, parent_id, body, created_at, deleted_at
            ],
        )?;
        Ok(())
    }
}
