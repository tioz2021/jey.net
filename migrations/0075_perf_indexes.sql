-- T169: indexes for the feed, liked list and collection detail.
CREATE INDEX IF NOT EXISTS reactions_user_created_idx
    ON reactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collection_items_order_idx
    ON collection_items (collection_id, position, created_at);

CREATE INDEX IF NOT EXISTS follows_follower_notifications_idx
    ON follows (follower_id, notifications)
    INCLUDE (followee_id);

CREATE INDEX IF NOT EXISTS items_public_high_rating_idx
    ON items (rating DESC, updated_at DESC)
    WHERE deleted_at IS NULL
      AND public_hidden = false
      AND status = 'done'
      AND rating >= 8;
