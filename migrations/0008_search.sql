-- Search support: trigram matching for partial words and typos.
--
-- The same extension is created by `scripts/db.sh create`; repeating it here
-- keeps a freshly migrated database self-sufficient.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX items_title_trgm_idx ON items USING gin (title gin_trgm_ops);
CREATE INDEX items_subtitle_trgm_idx ON items USING gin (subtitle gin_trgm_ops);
CREATE INDEX items_review_trgm_idx ON items USING gin (review gin_trgm_ops);
