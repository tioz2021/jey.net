//! Direct conversations between two accounts.
//!
//! T135 covers the inbox and thread lifecycle. Message history and read
//! receipts arrive with T136; the payload already exposes the last message and
//! unread count so the web inbox can be built without another shape change.

use axum::Json;
use axum::extract::{Path, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use ts_rs::TS;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct NewThread {
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatPeerView {
    pub id: Uuid,
    pub handle: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatLastMessageView {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub body: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatThreadView {
    pub id: Uuid,
    pub kind: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub muted: bool,
    pub peer: ChatPeerView,
    pub last_message: Option<ChatLastMessageView>,
    #[ts(type = "number")]
    pub unread: i64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatThreadListResponse {
    pub threads: Vec<ChatThreadView>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatThreadResponse {
    pub thread: ChatThreadView,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatReactionView {
    pub emoji: String,
    #[ts(type = "number")]
    pub count: i64,
    pub user_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatEnvelopeView {
    pub device_id: Uuid,
    pub version: i32,
    pub ephemeral_public: String,
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatEncryptedMessageView {
    pub version: i32,
    pub envelopes: Vec<ChatEnvelopeView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatMessageView {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub sender_id: Uuid,
    pub body: String,
    pub client_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[serde(default)]
    #[ts(optional = nullable)]
    pub edited_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    #[ts(optional = nullable)]
    pub reply_to_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    pub reactions: Option<Vec<ChatReactionView>>,
    #[serde(default)]
    #[ts(optional = nullable, type = "import(\"../types\").ChatEncryptedMessage | null")]
    pub encrypted: Option<serde_json::Value>,
    #[serde(default)]
    #[ts(optional = nullable)]
    pub encryption_version: Option<i32>,
    #[serde(default)]
    #[ts(optional = nullable, type = "import(\"../types\").ChatSharedItem | null")]
    pub shared_item: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatMessageListResponse {
    pub messages: Vec<ChatMessageView>,
    pub next_before: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatMessageResponse {
    pub message: ChatMessageView,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatMessageCreated {
    pub message: ChatMessageView,
    pub created: bool,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ChatReactionUpdate {
    pub message: ChatMessageView,
    pub reacted: bool,
    #[ts(type = "number")]
    pub count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatEvent {
    pub kind: String,
    pub thread_id: Uuid,
    pub recipients: Vec<Uuid>,
    pub message: Option<Value>,
    pub read_by: Option<Uuid>,
    pub typing_by: Option<Uuid>,
    #[serde(default)]
    pub origin: Uuid,
}

include!("chat/events.rs");
include!("chat/helpers.rs");
include!("chat/stream.rs");
include!("chat/handlers.rs");
include!("chat/settings.rs");
