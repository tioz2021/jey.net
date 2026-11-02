-- Tags: free-form labels the user attaches to items.
--
-- Uniqueness is case-insensitive per user, so "Sci-Fi" and "sci-fi" are one tag.
-- Removing an item or a tag cleans the link table, never the other side.

CREATE TABLE tags (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tags_name_trimmed CHECK (name = btrim(name)),
    CONSTRAINT tags_name_length CHECK (char_length(name) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX tags_user_name_unique ON tags (user_id, lower(name));

CREATE TABLE item_tags (
    item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,

    PRIMARY KEY (item_id, tag_id)
);

-- Filtering "everything with this tag" walks the link table from the tag side.
CREATE INDEX item_tags_tag_id_idx ON item_tags (tag_id);
