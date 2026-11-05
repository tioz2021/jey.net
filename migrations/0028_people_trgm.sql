-- Typo-tolerant public profile search.
CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx
    ON users USING gin (display_name gin_trgm_ops);
