-- T150.4: opaque per-device envelopes. The server never receives plaintext
-- for messages sent after E2E setup.
ALTER TABLE chat_messages
    ADD COLUMN encrypted jsonb,
    ADD COLUMN encryption_version integer;

ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_encryption_version_known
    CHECK (encryption_version IS NULL OR encryption_version = 1);
