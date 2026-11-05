ALTER TABLE notifications ADD COLUMN report_id uuid REFERENCES reports(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT notifications_kind;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind
    CHECK (kind IN ('follow', 'item', 'comment', 'reply', 'reaction', 'report'));

CREATE INDEX IF NOT EXISTS notifications_report_idx
    ON notifications (report_id)
    WHERE report_id IS NOT NULL;
