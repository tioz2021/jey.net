//! Small JSON cache for pages that need a read-only offline copy.

use serde_json::Value;

use super::{DesktopStore, StoreError};

impl DesktopStore {
    pub fn cache_get(&self, user_id: uuid::Uuid, key: &str) -> Result<Option<Value>, StoreError> {
        let connection = self.connection()?;
        let payload: Option<String> = connection
            .query_row(
                "select payload from api_cache where user_id = ?1 and cache_key = ?2",
                rusqlite::params![user_id.to_string(), key],
                |row| row.get(0),
            )
            .optional()?;
        payload
            .map(|raw| {
                serde_json::from_str(&raw).map_err(|error| StoreError::Invalid(error.to_string()))
            })
            .transpose()
    }

    pub fn cache_put(
        &self,
        user_id: uuid::Uuid,
        key: &str,
        payload: &Value,
    ) -> Result<(), StoreError> {
        let raw = serde_json::to_string(payload)
            .map_err(|error| StoreError::Invalid(error.to_string()))?;
        let connection = self.connection()?;
        connection.execute(
            "insert into api_cache (user_id, cache_key, payload, updated_at)
             values (?1, ?2, ?3, ?4)
             on conflict(user_id, cache_key) do update set
                payload = excluded.payload, updated_at = excluded.updated_at",
            rusqlite::params![user_id.to_string(), key, raw, super::now_millis(),],
        )?;
        Ok(())
    }
}

use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn cache_is_scoped_by_user_and_key() {
        let store = DesktopStore::in_memory().expect("store");
        let alice = uuid::Uuid::new_v4();
        let bob = uuid::Uuid::new_v4();
        store
            .cache_put(
                alice,
                "tier-lists",
                &serde_json::json!({ "tier_lists": [] }),
            )
            .unwrap();
        assert!(store.cache_get(alice, "tier-lists").unwrap().is_some());
        assert!(store.cache_get(bob, "tier-lists").unwrap().is_none());
        assert!(store.cache_get(alice, "liked").unwrap().is_none());
    }

    #[test]
    fn cache_can_be_replaced() {
        let store = DesktopStore::in_memory().expect("store");
        let user = uuid::Uuid::new_v4();
        store
            .cache_put(user, "liked", &serde_json::json!({ "items": [1] }))
            .unwrap();
        store
            .cache_put(user, "liked", &serde_json::json!({ "items": [2] }))
            .unwrap();
        assert_eq!(
            store.cache_get(user, "liked").unwrap().unwrap()["items"][0],
            2
        );
    }

    #[test]
    fn invalid_cache_payload_is_rejected() {
        let store = DesktopStore::in_memory().expect("store");
        let user = uuid::Uuid::new_v4();
        let connection = store.connection().unwrap();
        connection
            .execute(
                "insert into api_cache (user_id, cache_key, payload, updated_at)
                 values (?1, 'bad', 'not json', 0)",
                params![user.to_string()],
            )
            .unwrap();
        drop(connection);
        assert!(store.cache_get(user, "bad").is_err());
    }
}
