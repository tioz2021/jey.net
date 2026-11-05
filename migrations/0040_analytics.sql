-- Privacy-first product analytics: no cookies, no raw IPs, no titles or notes.
CREATE TABLE IF NOT EXISTS analytics_events (
    id bigserial PRIMARY KEY,
    name text NOT NULL,
    path text,
    locale text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
    ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
    ON analytics_events (name, created_at DESC);
