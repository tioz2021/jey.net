//! Generic outbox for offline tier-list and like mutations.

use serde_json::Value;

use super::{DesktopStore, StoreError};

#[derive(Debug, Clone)]
pub struct SocialOutboxRow {
    pub id: i64,
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
}

impl DesktopStore {
    pub fn enqueue_social(
        &self,
        user_id: uuid::Uuid,
        method: &str,
        path: &str,
        body: Option<&Value>,
    ) -> Result<(), StoreError> {
        let raw = body
            .map(|value| {
                serde_json::to_string(value).map_err(|error| StoreError::Invalid(error.to_string()))
            })
            .transpose()?;
        let connection = self.connection()?;
        connection.execute(
            "insert into social_outbox (user_id, method, path, body, created_at)
             values (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user_id.to_string(), method, path, raw, super::now_millis(),],
        )?;
        Ok(())
    }

    pub fn social_outbox(&self, user_id: uuid::Uuid) -> Result<Vec<SocialOutboxRow>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select id, method, path, body from social_outbox
             where user_id = ?1 order by id asc",
        )?;
        let rows = statement
            .query_map([user_id.to_string()], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)?;
        rows.into_iter()
            .map(|(id, method, path, raw)| {
                let body = raw
                    .map(|value| {
                        serde_json::from_str(&value)
                            .map_err(|error| StoreError::Invalid(error.to_string()))
                    })
                    .transpose()?;
                Ok(SocialOutboxRow {
                    id,
                    method,
                    path,
                    body,
                })
            })
            .collect()
    }

    pub fn clear_social_outbox(&self, id: i64) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute("delete from social_outbox where id = ?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outbox_round_trip_and_clear() {
        let store = DesktopStore::in_memory().expect("store");
        let user = uuid::Uuid::new_v4();
        store
            .enqueue_social(
                user,
                "PUT",
                "/api/v1/tier-lists/a/items/b",
                Some(&serde_json::json!({ "tier": "S" })),
            )
            .unwrap();
        let rows = store.social_outbox(user).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].method, "PUT");
        store.clear_social_outbox(rows[0].id).unwrap();
        assert!(store.social_outbox(user).unwrap().is_empty());
    }
}
