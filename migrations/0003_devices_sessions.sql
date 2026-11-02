-- Devices and sessions.
--
-- A device is one installation of the client (the desktop app, or a browser
-- acting as a client). Sessions reference the device they were created on so
-- sync requests can be attributed and revoked per device.

CREATE TABLE devices (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    installation_id uuid NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    last_sync_seq bigint NOT NULL DEFAULT 0,

    CONSTRAINT devices_installation_unique UNIQUE (user_id, installation_id),
    CONSTRAINT devices_name_trimmed CHECK (name = btrim(name)),
    CONSTRAINT devices_name_length CHECK (char_length(name) BETWEEN 1 AND 60),
    CONSTRAINT devices_platform_known CHECK (
        platform IN ('linux', 'macos', 'windows', 'android', 'ios', 'web', 'other')
    ),
    CONSTRAINT devices_sync_seq_non_negative CHECK (last_sync_seq >= 0)
);

CREATE INDEX devices_user_id_idx ON devices (user_id);

CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id uuid REFERENCES devices (id) ON DELETE SET NULL,
    token_hash bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ip inet,
    user_agent text,

    CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash),
    CONSTRAINT sessions_expiry_order CHECK (expires_at > created_at),
    CONSTRAINT sessions_user_agent_length CHECK (char_length(user_agent) <= 512)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX sessions_device_id_idx ON sessions (device_id);
