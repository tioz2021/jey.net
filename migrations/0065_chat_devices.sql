-- T150.2: public device keys for end-to-end encrypted chat.
-- Private keys never leave the client; the server stores only public X25519 keys.
CREATE TABLE chat_devices (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id uuid NOT NULL,
    public_key text NOT NULL,
    algorithm text NOT NULL DEFAULT 'x25519',
    name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,

    PRIMARY KEY (user_id, device_id),
    CONSTRAINT chat_devices_key_length CHECK (char_length(public_key) BETWEEN 1 AND 512),
    CONSTRAINT chat_devices_name_length CHECK (name IS NULL OR char_length(name) <= 80),
    CONSTRAINT chat_devices_algorithm_known CHECK (algorithm = 'x25519')
);

CREATE INDEX chat_devices_active_idx
    ON chat_devices (user_id, updated_at DESC)
    WHERE revoked_at IS NULL;
