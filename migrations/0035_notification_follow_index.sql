-- The old unique index covered every notification kind, so only one record
-- notification per author could ever exist. Limit it to follow events.
DROP INDEX IF EXISTS notifications_follow_once;
CREATE UNIQUE INDEX notifications_follow_once
    ON notifications (user_id, actor_id, kind)
    WHERE kind = 'follow';
