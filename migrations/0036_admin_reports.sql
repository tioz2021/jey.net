ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('item', 'comment', 'profile')),
    target_id uuid NOT NULL,
    reason text NOT NULL CHECK (reason IN ('spam', 'abuse', 'spoilers', 'other')),
    details text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (reporter_id, target_type, target_id),
    CONSTRAINT reports_details_length CHECK (details IS NULL OR char_length(details) <= 1000)
);
CREATE INDEX reports_status_idx ON reports (status, created_at);
