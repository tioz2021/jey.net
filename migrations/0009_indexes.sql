-- Indexes for the item list.
--
-- Records deleted through the bin keep their row forever (tombstones), so the
-- live-only indexes stay small while tombstones accumulate in the tables.

CREATE INDEX items_user_live_created_idx
    ON items (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX items_user_live_updated_idx
    ON items (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;
