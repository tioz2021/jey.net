-- Chat MVP: direct 1:1 conversations.
--
-- Messages are intentionally immutable in the MVP. `edited_at` and
-- `deleted_at` are reserved for later versions, but the API will not expose
-- them until T149.

CREATE TABLE chat_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL DEFAULT 'direct',
    direct_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chat_threads_kind_known CHECK (kind IN ('direct')),
    CONSTRAINT chat_threads_direct_key_required CHECK (
        (kind = 'direct' AND direct_key IS NOT NULL)
        OR kind <> 'direct'
    ),
    CONSTRAINT chat_threads_direct_key_unique UNIQUE (direct_key),
    CONSTRAINT chat_threads_direct_key_length CHECK (
        direct_key IS NULL OR char_length(direct_key) = 73
    )
);

CREATE TABLE chat_members (
    thread_id uuid NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_read_at timestamptz,
    muted_at timestamptz,
    hidden_at timestamptz,

    PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    client_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    deleted_at timestamptz,

    CONSTRAINT chat_messages_sender_is_member
        FOREIGN KEY (thread_id, sender_id)
        REFERENCES chat_members (thread_id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT chat_messages_body_trimmed CHECK (body = btrim(body)),
    CONSTRAINT chat_messages_body_length CHECK (char_length(body) BETWEEN 1 AND 4000),
    CONSTRAINT chat_messages_client_unique UNIQUE (thread_id, client_id)
);

CREATE TABLE chat_settings (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    message_policy text NOT NULL DEFAULT 'all',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chat_settings_message_policy_known
        CHECK (message_policy IN ('all', 'following', 'nobody'))
);

CREATE INDEX chat_threads_updated_idx
    ON chat_threads (updated_at DESC);

CREATE INDEX chat_members_user_idx
    ON chat_members (user_id, hidden_at, thread_id);

CREATE INDEX chat_messages_thread_idx
    ON chat_messages (thread_id, created_at DESC, id DESC);

CREATE TRIGGER chat_threads_set_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER chat_settings_set_updated_at
    BEFORE UPDATE ON chat_settings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
