-- Offline chat cache and outgoing message queue.
-- A queued message is written to chat_messages with pending = 1 and to
-- chat_outbox. Reconnect flushes the queue in created_at order.

CREATE TABLE chat_threads (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'direct',
    peer_id TEXT NOT NULL,
    peer_handle TEXT NOT NULL,
    peer_display_name TEXT NOT NULL,
    peer_avatar_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    muted INTEGER NOT NULL DEFAULT 0,
    unread INTEGER NOT NULL DEFAULT 0,
    last_message_id TEXT,
    last_message_sender_id TEXT,
    last_message_body TEXT,
    last_message_created_at INTEGER
);

CREATE INDEX chat_threads_updated_idx ON chat_threads (updated_at DESC);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    pending INTEGER NOT NULL DEFAULT 0,
    UNIQUE (thread_id, client_id)
);

CREATE INDEX chat_messages_thread_created_idx ON chat_messages (thread_id, created_at DESC);

CREATE TABLE chat_outbox (
    thread_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (thread_id, client_id)
);
