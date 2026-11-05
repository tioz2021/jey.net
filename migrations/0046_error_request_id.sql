ALTER TABLE system_errors ADD COLUMN request_id text;
CREATE INDEX IF NOT EXISTS system_errors_path_status_idx
    ON system_errors (path, status, created_at DESC);
