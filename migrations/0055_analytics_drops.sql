CREATE TABLE IF NOT EXISTS analytics_drops (
    day date PRIMARY KEY,
    count bigint NOT NULL DEFAULT 0
);
