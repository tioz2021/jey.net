-- Notify followers when a public record is created.
ALTER TABLE notifications ADD COLUMN item_id uuid REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT notifications_kind;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind
    CHECK (kind IN ('follow', 'item'));
CREATE UNIQUE INDEX notifications_item_once
    ON notifications (user_id, item_id)
    WHERE item_id IS NOT NULL;
