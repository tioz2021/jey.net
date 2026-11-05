-- Public comments on shared records, one reply level.
CREATE TABLE comments (
    id uuid PRIMARY KEY,
    item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX comments_item_idx ON comments (item_id, created_at);
CREATE INDEX comments_parent_idx ON comments (parent_id, created_at);
