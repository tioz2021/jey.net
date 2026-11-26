// Chat event bus and PostgreSQL cross-instance listener.

#[derive(Serialize)]
struct ChatEventWire<'a> {
    kind: &'a str,
    thread_id: Uuid,
    message: &'a Option<Value>,
    read_by: Option<Uuid>,
    typing_by: Option<Uuid>,
}

impl ChatEvent {
    fn sse(&self) -> axum::response::sse::Event {
        let wire = ChatEventWire {
            kind: &self.kind,
            thread_id: self.thread_id,
            message: &self.message,
            read_by: self.read_by,
            typing_by: self.typing_by,
        };
        let data = serde_json::to_string(&wire).unwrap_or_else(|_| "{}".to_owned());
        axum::response::sse::Event::default()
            .event(self.kind.clone())
            .data(data)
    }
}

#[derive(Clone)]
pub struct ChatEvents {
    tx: broadcast::Sender<ChatEvent>,
    instance: Uuid,
}

impl ChatEvents {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            tx,
            instance: Uuid::new_v4(),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ChatEvent> {
        self.tx.subscribe()
    }

    fn forward(&self, event: ChatEvent) {
        let _ = self.tx.send(event);
    }

    /// Publish locally and to other API instances through PostgreSQL.
    pub async fn publish(&self, pool: &PgPool, mut event: ChatEvent) {
        event.origin = self.instance;
        let _ = self.tx.send(event.clone());
        if let Ok(payload) = serde_json::to_string(&event) {
            let _ = sqlx::query("select pg_notify('chat_events', $1)")
                .bind(payload)
                .execute(pool)
                .await;
        }
    }
}

/// Starts the cross-instance listener. Failure to listen is non-fatal: the
/// instance keeps its in-process delivery and falls back to polling clients.
pub async fn spawn_listener(pool: PgPool, events: Arc<ChatEvents>) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect_with(&pool).await?;
    listener.listen("chat_events").await?;
    tokio::spawn(async move {
        loop {
            let notification = match listener.recv().await {
                Ok(notification) => notification,
                Err(error) => {
                    tracing::warn!(%error, "chat listener stopped");
                    break;
                }
            };
            let Ok(event) = serde_json::from_str::<ChatEvent>(notification.payload()) else {
                continue;
            };
            if event.origin != events.instance {
                events.forward(event);
            }
        }
    });
    Ok(())
}

impl Default for ChatEvents {
    fn default() -> Self {
        Self::new()
    }
}
