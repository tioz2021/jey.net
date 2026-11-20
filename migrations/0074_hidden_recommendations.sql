-- T160: recommendations dismissed by a user, persisted across devices.
CREATE TABLE hidden_recommendations (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, author_id, item_id)
);

CREATE INDEX hidden_recommendations_user_idx
    ON hidden_recommendations (user_id, created_at DESC);
