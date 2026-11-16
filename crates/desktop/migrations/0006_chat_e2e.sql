-- T150.5: encrypted chat envelopes in the local cache/outbox and a cache of
-- peer public device keys for offline encryption.
ALTER TABLE chat_messages ADD COLUMN encrypted TEXT;
ALTER TABLE chat_messages ADD COLUMN encryption_version INTEGER;
ALTER TABLE chat_outbox ADD COLUMN encrypted TEXT;
ALTER TABLE chat_outbox ADD COLUMN encryption_version INTEGER;

CREATE TABLE chat_devices (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'x25519',
    name TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, device_id)
);
