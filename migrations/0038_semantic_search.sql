-- Trigram index for the metadata part of the lightweight semantic search.
CREATE INDEX IF NOT EXISTS items_details_trgm_idx
    ON items USING gin ((coalesce(details::text, '')) gin_trgm_ops);
