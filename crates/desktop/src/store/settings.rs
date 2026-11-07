//! Local profile settings used while offline.

use serde_json::{Value, json};
use uuid::Uuid;

use super::{DesktopStore, StoreError};

const KEY: &str = "profile";

impl DesktopStore {
    pub fn local_profile(&self, user_id: Uuid) -> Result<Value, StoreError> {
        let connection = self.connection()?;
        let raw: Option<String> = connection
            .query_row(
                "select value from local_settings where key = ?1",
                [KEY],
                |row| row.get(0),
            )
            .ok();
        let mut value = raw
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .unwrap_or_else(|| json!({}));
        if value.get("display_name").is_none() {
            value["display_name"] = json!("Локальная библиотека");
        }
        value["id"] = json!(user_id);
        value["handle"] = value
            .get("handle")
            .cloned()
            .unwrap_or_else(|| json!("local"));
        value["locale"] = value.get("locale").cloned().unwrap_or_else(|| json!("ru"));
        value["role"] = json!("user");
        value["is_public"] = value
            .get("is_public")
            .cloned()
            .unwrap_or(Value::Bool(false));
        value["public_statuses"] = value
            .get("public_statuses")
            .cloned()
            .unwrap_or_else(|| json!([]));
        value["public_show_progress"] = value
            .get("public_show_progress")
            .cloned()
            .unwrap_or(Value::Bool(false));
        value["email"] = value.get("email").cloned().unwrap_or(Value::Null);
        value["avatar_key"] = value.get("avatar_key").cloned().unwrap_or(Value::Null);
        value["banner_key"] = value.get("banner_key").cloned().unwrap_or(Value::Null);
        Ok(value)
    }

    pub fn save_local_profile(&self, user_id: Uuid, patch: &Value) -> Result<Value, StoreError> {
        let mut profile = self.local_profile(user_id)?;
        for key in [
            "display_name",
            "locale",
            "is_public",
            "public_statuses",
            "public_show_progress",
        ] {
            if let Some(value) = patch.get(key) {
                profile[key] = value.clone();
            }
        }
        let connection = self.connection()?;
        let text = serde_json::to_string(&profile)
            .map_err(|error| StoreError::Invalid(error.to_string()))?;
        connection.execute("insert into local_settings (key, value) values (?1, ?2) on conflict(key) do update set value = excluded.value", [KEY, &text])?;
        Ok(profile)
    }
}

impl DesktopStore {
    pub fn profile_dirty(&self) -> Result<bool, StoreError> {
        let connection = self.connection()?;
        let value: Option<String> = connection
            .query_row(
                "select value from local_settings where key = 'profile_dirty'",
                [],
                |row| row.get(0),
            )
            .ok();
        Ok(value.as_deref() == Some("1"))
    }

    pub fn set_profile_dirty(&self, dirty: bool) -> Result<(), StoreError> {
        let connection = self.connection()?;
        if dirty {
            connection.execute(
                "insert or replace into local_settings (key, value) values ('profile_dirty', '1')",
                [],
            )?;
        } else {
            connection.execute("delete from local_settings where key = 'profile_dirty'", [])?;
        }
        Ok(())
    }
}
