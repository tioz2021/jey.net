ALTER TABLE analytics_events ADD COLUMN visitor_hash text;
CREATE INDEX IF NOT EXISTS analytics_visitor_idx
    ON analytics_events (visitor_hash, created_at)
    WHERE visitor_hash IS NOT NULL;
