-- Items: the things a person watched, read, saved or noted.
--
-- `revision` is bumped by the client on every edit, `sync_seq` is assigned by
-- the server; together they let devices synchronise without losing changes
-- (see docs/sync.md). `deleted_at` is a tombstone, not a hard delete.

CREATE TABLE items (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL,
    subtitle text,
    year integer,
    status text NOT NULL,
    rating smallint,
    review text,
    source_url text,
    cover_key text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    revision bigint NOT NULL DEFAULT 1,
    sync_seq bigint NOT NULL DEFAULT 0,
    device_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,

    CONSTRAINT items_kind_known CHECK (kind IN ('movie', 'book', 'image', 'other')),
    CONSTRAINT items_status_known CHECK (
        status IN ('planned', 'in_progress', 'done', 'dropped')
    ),
    CONSTRAINT items_title_trimmed CHECK (title = btrim(title)),
    CONSTRAINT items_title_length CHECK (char_length(title) BETWEEN 1 AND 300),
    CONSTRAINT items_subtitle_length CHECK (subtitle IS NULL OR char_length(subtitle) <= 300),
    CONSTRAINT items_review_length CHECK (review IS NULL OR char_length(review) <= 20000),
    CONSTRAINT items_source_url_length CHECK (
        source_url IS NULL OR char_length(source_url) <= 2048
    ),
    CONSTRAINT items_year_range CHECK (year IS NULL OR year BETWEEN 1800 AND 2100),
    CONSTRAINT items_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
    CONSTRAINT items_revision_positive CHECK (revision >= 1),
    CONSTRAINT items_sync_seq_non_negative CHECK (sync_seq >= 0)
);

CREATE INDEX items_user_created_idx ON items (user_id, created_at DESC);
CREATE INDEX items_user_kind_idx ON items (user_id, kind);
CREATE INDEX items_user_status_idx ON items (user_id, status);
-- Used by the sync endpoints to stream changes after a given sequence number.
CREATE INDEX items_user_sync_seq_idx ON items (user_id, sync_seq);

CREATE TRIGGER items_set_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
