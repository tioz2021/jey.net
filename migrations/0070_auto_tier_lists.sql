-- T152.2: automatic per-category tier lists driven by item ratings.
ALTER TABLE tier_lists
    ADD COLUMN auto boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX tier_lists_user_auto_kind_idx
    ON tier_lists (user_id, kind)
    WHERE auto;
