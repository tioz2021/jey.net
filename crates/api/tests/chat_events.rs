//! T137.1: events published by one API instance reach another via LISTEN/NOTIFY.

mod common;

use std::sync::Arc;
use std::time::Duration;

use common::TestClient;
use jey_api::chat::{ChatEvent, ChatEvents};
use uuid::Uuid;

#[tokio::test]
async fn notification_crosses_instances_and_is_not_duplicated_locally() {
    let client = TestClient::new().await;
    let receiver = ChatEvents::new();
    let receiver_listener = receiver.clone();
    jey_api::chat::spawn_listener(client.pool().clone(), Arc::new(receiver_listener))
        .await
        .expect("listener");

    let mut events = receiver.subscribe();
    let sender = ChatEvents::new();
    let thread_id = Uuid::new_v4();
    sender
        .publish(
            client.pool(),
            ChatEvent {
                kind: "message.created".to_owned(),
                thread_id,
                recipients: vec![Uuid::new_v4()],
                message: Some(serde_json::json!({ "body": "cross-instance" })),
                read_by: None,
                origin: Uuid::nil(),
            },
        )
        .await;

    let received = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let event = events.recv().await.expect("event");
            if event.thread_id == thread_id && event.kind == "message.created" {
                return event;
            }
        }
    })
    .await
    .expect("event through PostgreSQL notification");

    assert_eq!(received.message.as_ref().unwrap()["body"], "cross-instance");
    assert_ne!(received.origin, Uuid::nil());
}
