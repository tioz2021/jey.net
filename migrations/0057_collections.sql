CREATE TABLE collections (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title text NOT NULL,
    slug citext NOT NULL,
    visibility text NOT NULL DEFAULT 'private',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT collections_title_trimmed CHECK (title = btrim(title)),
    CONSTRAINT collections_title_length CHECK (char_length(title) BETWEEN 1 AND 80),
    CONSTRAINT collections_visibility CHECK (visibility IN ('private', 'public')),
    UNIQUE (user_id, slug)
);

CREATE TABLE collection_items (
    collection_id uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX collections_user_idx ON collections (user_id, created_at DESC);
CREATE INDEX collection_items_item_idx ON collection_items (item_id);

CREATE TRIGGER collections_set_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
