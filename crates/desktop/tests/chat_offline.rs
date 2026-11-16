//! T143/T145: chat history survives restart and an offline send is queued
//! with a stable client_id until the server accepts it.

use std::fs;
use std::path::PathBuf;

use jey_desktop::store::DesktopStore;
use serde_json::json;
use uuid::Uuid;

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join(format!("jey-chat-offline-{}", Uuid::new_v4()))
}

#[tokio::test]
async fn cached_thread_and_queued_message_survive_restart() {
    let dir = temp_dir();
    fs::create_dir_all(&dir).expect("data dir");
    let client_id = Uuid::new_v4().to_string();

    {
        let store = DesktopStore::open(&dir).expect("store");
        store
            .save_chat_thread(&json!({
                "id": "thread-1",
                "kind": "direct",
                "created_at": "2026-11-16T10:00:00Z",
                "updated_at": "2026-11-16T10:05:00Z",
                "muted": false,
                "unread": 1,
                "peer": { "id": "peer-1", "handle": "bob", "display_name": "Bob", "avatar_key": null },
                "last_message": { "id": "m1", "sender_id": "peer-1", "body": "Привет", "created_at": "2026-11-16T10:05:00Z" }
            }))
            .expect("thread");
        store
            .cache_chat_messages(&json!({ "messages": [{
                "id": "m1", "thread_id": "thread-1", "sender_id": "peer-1",
                "body": "Привет", "client_id": "server-1",
                "created_at": "2026-11-16T10:05:00Z"
            }] }))
            .expect("messages");
        let queued = store
            .queue_chat_message("thread-1", "me", "Офлайн-сообщение", &client_id)
            .expect("queue");
        assert_eq!(queued["pending"], true);
        assert_eq!(store.chat_outbox().expect("outbox").len(), 1);
    }

    let reopened = DesktopStore::open(&dir).expect("reopen");
    let threads = reopened.list_chat_threads().expect("threads");
    assert_eq!(threads["threads"][0]["peer"]["display_name"], "Bob");
    assert_eq!(
        threads["threads"][0]["last_message"]["body"],
        "Офлайн-сообщение"
    );
    let messages = reopened
        .list_chat_messages("thread-1", None, 50)
        .expect("messages");
    let queued = messages["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["client_id"] == client_id)
        .expect("queued message");
    assert_eq!(queued["pending"], true);
    assert_eq!(reopened.chat_outbox().expect("outbox").len(), 1);

    // Reconnect: the server returns the same client_id and the queue is cleared.
    reopened
        .save_chat_message(
            &json!({
                "id": "server-2", "thread_id": "thread-1", "sender_id": "me",
                "body": "Офлайн-сообщение", "client_id": client_id,
                "created_at": "2026-11-16T10:06:00Z"
            }),
            false,
        )
        .expect("server message");
    reopened.clear_chat_outbox(&client_id).expect("flush");
    assert!(reopened.chat_outbox().expect("outbox").is_empty());
    let messages = reopened
        .list_chat_messages("thread-1", None, 50)
        .expect("messages");
    assert_eq!(
        messages["messages"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|message| message["client_id"] == client_id)
            .count(),
        1
    );

    fs::remove_dir_all(dir).ok();
}
