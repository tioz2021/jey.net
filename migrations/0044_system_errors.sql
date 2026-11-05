CREATE TABLE IF NOT EXISTS system_errors (
    id bigserial PRIMARY KEY,
    path text NOT NULL,
    status smallint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_errors_created_idx
    ON system_errors (created_at DESC);
