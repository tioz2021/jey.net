-- Movie metadata saved from TMDB when a film is added. It is a snapshot: the
-- catalogue reads it from here, TMDB is only queried again on refresh.
ALTER TABLE items
    ADD COLUMN external_source text,
    ADD COLUMN external_id text,
    ADD COLUMN details jsonb,
    ADD COLUMN details_fetched_at timestamptz;

CREATE INDEX items_external_idx
    ON items (user_id, external_source, external_id)
    WHERE external_id IS NOT NULL;
