-- T149: per-message reactions. Message editing uses the existing edited_at.
CREATE TABLE chat_reactions (
    message_id uuid NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (message_id, user_id, emoji),
    CONSTRAINT chat_reactions_emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 16)
);

CREATE INDEX chat_reactions_message_idx ON chat_reactions (message_id);
