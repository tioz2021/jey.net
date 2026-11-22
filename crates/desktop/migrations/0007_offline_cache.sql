-- T172: cached JSON for read-only offline pages.
CREATE TABLE api_cache (
    user_id TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, cache_key)
);

CREATE INDEX api_cache_updated_idx ON api_cache (user_id, updated_at);
