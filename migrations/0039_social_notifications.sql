ALTER TABLE notifications ADD COLUMN comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT notifications_kind;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind
    CHECK (kind IN ('follow', 'item', 'comment', 'reply', 'reaction'));

-- The item index only applies to the "new record" event; comments and
-- reactions need their own notification rows for the same item.
DROP INDEX IF EXISTS notifications_item_once;
CREATE UNIQUE INDEX notifications_item_once
    ON notifications (user_id, item_id)
    WHERE kind = 'item';

CREATE INDEX IF NOT EXISTS notifications_comment_idx
    ON notifications (comment_id)
    WHERE comment_id IS NOT NULL;
