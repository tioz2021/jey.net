-- Local mirror of the server catalogue plus sync bookkeeping.
-- Timestamps are Unix milliseconds; JSON stays JSON text.

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slug TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    year INTEGER,
    status TEXT NOT NULL,
    rating INTEGER,
    review TEXT,
    body TEXT,
    source_url TEXT,
    cover_key TEXT,
    public_hidden INTEGER NOT NULL DEFAULT 0,
    external_source TEXT,
    external_id TEXT,
    details TEXT,
    details_fetched_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    sync_seq INTEGER NOT NULL DEFAULT 0,
    device_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX items_user_updated_idx ON items (user_id, updated_at DESC);
CREATE INDEX items_user_sync_idx ON items (user_id, sync_seq);
CREATE INDEX items_title_idx ON items (lower(title));

CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX collections_user_slug_idx ON collections (user_id, slug);

CREATE TABLE collection_items (
    collection_id TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, item_id)
);

CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sync_seq INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

INSERT INTO sync_state (id, last_sync_seq, updated_at) VALUES (1, 0, 0);

-- One queued mutation per entity: editing offline replaces the previous payload.
CREATE TABLE outbox (
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    payload TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (entity, entity_id)
);

CREATE TABLE conflicts (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    incoming TEXT NOT NULL,
    stored TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
);

CREATE INDEX conflicts_open_idx ON conflicts (created_at) WHERE resolved_at IS NULL;

CREATE TABLE local_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
