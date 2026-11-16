//! Local chat cache and offline outgoing queue.

use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use uuid::Uuid;

use super::{DesktopStore, StoreError};

fn millis(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(number)) => number.as_i64().unwrap_or(0),
        Some(Value::String(raw)) => chrono::DateTime::parse_from_rfc3339(raw)
            .map(|date| date.timestamp_millis())
            .unwrap_or(0),
        _ => 0,
    }
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

impl DesktopStore {
    pub fn save_chat_thread(&self, thread: &Value) -> Result<(), StoreError> {
        let Some(id) = text(thread, "id") else {
            return Ok(());
        };
        let peer = thread.get("peer").cloned().unwrap_or(Value::Null);
        let last = thread.get("last_message").cloned().unwrap_or(Value::Null);
        let connection = self.connection()?;
        connection.execute(
            "insert into chat_threads
                (id, kind, peer_id, peer_handle, peer_display_name, peer_avatar_key,
                 created_at, updated_at, muted, unread, last_message_id,
                 last_message_sender_id, last_message_body, last_message_created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             on conflict (id) do update set
                kind = excluded.kind, peer_id = excluded.peer_id,
                peer_handle = excluded.peer_handle,
                peer_display_name = excluded.peer_display_name,
                peer_avatar_key = excluded.peer_avatar_key,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                muted = excluded.muted, unread = excluded.unread,
                last_message_id = excluded.last_message_id,
                last_message_sender_id = excluded.last_message_sender_id,
                last_message_body = excluded.last_message_body,
                last_message_created_at = excluded.last_message_created_at",
            params![
                id,
                text(thread, "kind").unwrap_or("direct"),
                text(&peer, "id").unwrap_or(""),
                text(&peer, "handle").unwrap_or(""),
                text(&peer, "display_name").unwrap_or("Без имени"),
                text(&peer, "avatar_key"),
                millis(thread.get("created_at")),
                millis(thread.get("updated_at")),
                thread
                    .get("muted")
                    .and_then(Value::as_bool)
                    .unwrap_or(false) as i64,
                thread.get("unread").and_then(Value::as_i64).unwrap_or(0),
                text(&last, "id"),
                text(&last, "sender_id"),
                text(&last, "body"),
                last.get("created_at").map(|value| millis(Some(value))),
            ],
        )?;
        Ok(())
    }

    pub fn save_chat_message(&self, message: &Value, pending: bool) -> Result<(), StoreError> {
        let (Some(id), Some(thread_id), Some(sender_id), Some(body), Some(client_id)) = (
            text(message, "id"),
            text(message, "thread_id"),
            text(message, "sender_id"),
            text(message, "body"),
            text(message, "client_id"),
        ) else {
            return Ok(());
        };
        let connection = self.connection()?;
        connection.execute(
            "insert into chat_messages
                (id, thread_id, sender_id, body, client_id, created_at, pending)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict (thread_id, client_id) do update set
                id = excluded.id, sender_id = excluded.sender_id,
                body = excluded.body, created_at = excluded.created_at,
                pending = excluded.pending",
            params![
                id,
                thread_id,
                sender_id,
                body,
                client_id,
                millis(message.get("created_at")),
                pending as i64
            ],
        )?;
        Ok(())
    }

    pub fn cache_chat_threads(&self, value: &Value) -> Result<(), StoreError> {
        let Some(threads) = value.get("threads").and_then(Value::as_array) else {
            return Ok(());
        };
        for thread in threads {
            self.save_chat_thread(thread)?;
        }
        Ok(())
    }

    pub fn cache_chat_messages(&self, value: &Value) -> Result<(), StoreError> {
        let Some(messages) = value.get("messages").and_then(Value::as_array) else {
            return Ok(());
        };
        for message in messages {
            self.save_chat_message(message, false)?;
        }
        Ok(())
    }

    pub fn list_chat_threads(&self) -> Result<Value, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select id, kind, peer_id, peer_handle, peer_display_name, peer_avatar_key,
                    created_at, updated_at, muted, unread, last_message_id,
                    last_message_sender_id, last_message_body, last_message_created_at
             from chat_threads order by updated_at desc",
        )?;
        let rows = statement.query_map([], |row| {
            let last_id: Option<String> = row.get(10)?;
            let last_sender: Option<String> = row.get(11)?;
            let last_body: Option<String> = row.get(12)?;
            let last_created: Option<i64> = row.get(13)?;
            let last = last_id.as_ref().map(|id| {
                json!({
                    "id": id,
                    "sender_id": last_sender,
                    "body": last_body,
                    "created_at": last_created.map(|value| value.to_string()),
                })
            });
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "kind": row.get::<_, String>(1)?,
                "peer": {
                    "id": row.get::<_, String>(2)?,
                    "handle": row.get::<_, String>(3)?,
                    "display_name": row.get::<_, String>(4)?,
                    "avatar_key": row.get::<_, Option<String>>(5)?,
                },
                "created_at": row.get::<_, i64>(6)?.to_string(),
                "updated_at": row.get::<_, i64>(7)?.to_string(),
                "muted": row.get::<_, i64>(8)? != 0,
                "unread": row.get::<_, i64>(9)?,
                "last_message": last,
            }))
        })?;
        let threads = rows
            .collect::<rusqlite::Result<Vec<Value>>>()
            .map_err(StoreError::Sql)?;
        Ok(json!({ "threads": threads }))
    }

    pub fn get_chat_thread(&self, thread_id: &str) -> Result<Option<Value>, StoreError> {
        let all = self.list_chat_threads()?;
        Ok(all
            .get("threads")
            .and_then(Value::as_array)
            .and_then(|threads| {
                threads
                    .iter()
                    .find(|thread| text(thread, "id") == Some(thread_id))
                    .cloned()
            }))
    }

    pub fn list_chat_messages(
        &self,
        thread_id: &str,
        before: Option<&str>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        let limit = limit.clamp(1, 100);
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select id, thread_id, sender_id, body, client_id, created_at, pending
             from chat_messages
             where thread_id = ?1
               and (?2 is null or created_at < (
                   select created_at from chat_messages where id = ?2
               ))
             order by created_at desc limit ?3",
        )?;
        let rows = statement.query_map(params![thread_id, before, limit + 1], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "thread_id": row.get::<_, String>(1)?,
                "sender_id": row.get::<_, String>(2)?,
                "body": row.get::<_, String>(3)?,
                "client_id": row.get::<_, String>(4)?,
                "created_at": row.get::<_, i64>(5)?.to_string(),
                "pending": row.get::<_, i64>(6)? != 0,
            }))
        })?;
        let mut messages = rows
            .collect::<rusqlite::Result<Vec<Value>>>()
            .map_err(StoreError::Sql)?;
        let has_more = messages.len() as i64 > limit;
        if has_more {
            messages.truncate(limit as usize);
        }
        messages.reverse();
        let next_before = has_more
            .then(|| {
                messages
                    .first()
                    .and_then(|message| text(message, "id"))
                    .map(str::to_owned)
            })
            .flatten();
        Ok(json!({ "messages": messages, "next_before": next_before }))
    }

    pub fn queue_chat_message(
        &self,
        thread_id: &str,
        sender_id: &str,
        body: &str,
        client_id: &str,
    ) -> Result<Value, StoreError> {
        let now = super::now_millis();
        let id = Uuid::new_v4().to_string();
        let message = json!({
            "id": id,
            "thread_id": thread_id,
            "sender_id": sender_id,
            "body": body,
            "client_id": client_id,
            "created_at": now.to_string(),
            "pending": true,
        });
        let thread = self.get_chat_thread(thread_id)?;
        if thread.is_some() {
            self.save_chat_message(&message, true)?;
            let connection = self.connection()?;
            connection.execute(
                "insert or replace into chat_outbox (thread_id, client_id, body, created_at)
                 values (?1, ?2, ?3, ?4)",
                params![thread_id, client_id, body, now],
            )?;
            connection.execute(
                "update chat_threads set updated_at = ?2, last_message_id = ?3,
                    last_message_sender_id = ?4, last_message_body = ?5,
                    last_message_created_at = ?2 where id = ?1",
                params![thread_id, now, id, sender_id, body],
            )?;
        }
        Ok(message)
    }

    pub fn chat_outbox(&self) -> Result<Vec<(String, String, String)>, StoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "select thread_id, client_id, body from chat_outbox order by created_at asc",
        )?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::Sql)
    }

    pub fn clear_chat_outbox(&self, client_id: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute("delete from chat_outbox where client_id = ?1", [client_id])?;
        connection.execute(
            "update chat_messages set pending = 0 where client_id = ?1",
            [client_id],
        )?;
        Ok(())
    }

    pub fn set_chat_muted(&self, thread_id: &str, muted: bool) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "update chat_threads set muted = ?2 where id = ?1",
            params![thread_id, muted as i64],
        )?;
        Ok(())
    }

    pub fn mark_chat_read(&self, thread_id: &str) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute(
            "update chat_threads set unread = 0 where id = ?1",
            [thread_id],
        )?;
        Ok(())
    }

    pub fn clear_chat_data(&self) -> Result<(), StoreError> {
        let connection = self.connection()?;
        connection.execute("delete from chat_outbox", [])?;
        connection.execute("delete from chat_messages", [])?;
        connection.execute("delete from chat_threads", [])?;
        Ok(())
    }

    pub fn chat_unread(&self) -> Result<i64, StoreError> {
        let connection = self.connection()?;
        let unread: i64 = connection.query_row(
            "select coalesce(sum(unread), 0) from chat_threads where muted = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(unread)
    }

    pub fn chat_thread_exists(&self, thread_id: &str) -> Result<bool, StoreError> {
        let connection = self.connection()?;
        Ok(connection.query_row(
            "select exists(select 1 from chat_threads where id = ?1)",
            [thread_id],
            |row| row.get::<_, i64>(0),
        )? != 0)
    }

    pub fn chat_message_id(&self, client_id: &str) -> Result<Option<String>, StoreError> {
        let connection = self.connection()?;
        Ok(connection
            .query_row(
                "select id from chat_messages where client_id = ?1",
                [client_id],
                |row| row.get(0),
            )
            .optional()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread() -> Value {
        json!({
            "id": "t1",
            "kind": "direct",
            "created_at": "2026-11-16T10:00:00Z",
            "updated_at": "2026-11-16T10:05:00Z",
            "muted": false,
            "unread": 1,
            "peer": { "id": "u2", "handle": "bob", "display_name": "Bob", "avatar_key": null },
            "last_message": { "id": "m1", "sender_id": "u2", "body": "hello", "created_at": "2026-11-16T10:05:00Z" }
        })
    }

    #[test]
    fn cache_threads_messages_and_queue() {
        let store = DesktopStore::in_memory().expect("store");
        store.save_chat_thread(&thread()).expect("thread");
        let threads = store.list_chat_threads().expect("threads");
        assert_eq!(threads["threads"][0]["peer"]["handle"], "bob");
        assert_eq!(threads["threads"][0]["unread"], 1);

        store
            .cache_chat_messages(&json!({ "messages": [{
                "id": "m1", "thread_id": "t1", "sender_id": "u2",
                "body": "hello", "client_id": "c1",
                "created_at": "2026-11-16T10:05:00Z"
            }] }))
            .expect("messages");
        let messages = store.list_chat_messages("t1", None, 50).expect("list");
        assert_eq!(messages["messages"][0]["body"], "hello");

        let queued = store
            .queue_chat_message("t1", "u1", "offline text", "c2")
            .expect("queue");
        assert_eq!(queued["pending"], true);
        assert_eq!(store.chat_outbox().expect("outbox").len(), 1);
        let messages = store.list_chat_messages("t1", None, 50).expect("list");
        assert_eq!(messages["messages"].as_array().unwrap().len(), 2);
        assert_eq!(
            messages["messages"]
                .as_array()
                .unwrap()
                .iter()
                .find(|message| message["body"] == "offline text")
                .is_some(),
            true
        );
        store.clear_chat_outbox("c2").expect("flush");
        assert!(store.chat_outbox().expect("outbox").is_empty());
        assert_eq!(store.chat_unread().expect("unread"), 1);
    }
}
