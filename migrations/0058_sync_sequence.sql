-- One monotonic sync sequence per user.
--
-- The sequence is assigned by a trigger, so every write path (create, edit,
-- cover, metadata refresh, soft delete, restore) advances it. Clients only
-- ever pull `sync_seq > since`; gaps are fine and expected after a hard purge.

ALTER TABLE users
    ADD COLUMN sync_seq bigint NOT NULL DEFAULT 0,
    ADD CONSTRAINT users_sync_seq_non_negative CHECK (sync_seq >= 0);

-- Backfill existing records in their historical order. `updated_at` is enough
-- for a stable first sync; ties are broken by id.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY user_id
               ORDER BY updated_at ASC, created_at ASC, id ASC
           ) AS seq
    FROM items
)
UPDATE items i
SET sync_seq = ranked.seq
FROM ranked
WHERE i.id = ranked.id;

UPDATE users u
SET sync_seq = COALESCE(
    (SELECT max(i.sync_seq) FROM items i WHERE i.user_id = u.id),
    0
);

-- The old non-unique index is replaced by the stronger invariant.
DROP INDEX IF EXISTS items_user_sync_seq_idx;
CREATE UNIQUE INDEX items_user_sync_seq_idx ON items (user_id, sync_seq);

CREATE OR REPLACE FUNCTION jey_items_assign_sync_seq()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    next_seq bigint;
BEGIN
    -- No-op updates must not consume a sequence number.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'sync_seq') = (to_jsonb(OLD) - 'sync_seq') THEN
        RETURN NEW;
    END IF;

    UPDATE users
    SET sync_seq = sync_seq + 1
    WHERE id = NEW.user_id
    RETURNING sync_seq INTO next_seq;

    NEW.sync_seq := next_seq;
    RETURN NEW;
END;
$$;

CREATE TRIGGER items_assign_sync_seq
BEFORE INSERT OR UPDATE ON items
FOR EACH ROW
EXECUTE FUNCTION jey_items_assign_sync_seq();
