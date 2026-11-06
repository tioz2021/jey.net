-- Idempotent sync batches and conflict copies.
--
-- The push response is stored per batch so a retry after a dropped connection
-- returns exactly the same applied/conflict set without writing again.

CREATE TABLE sync_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    batch_id uuid NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT sync_batches_unique UNIQUE (user_id, device_id, batch_id)
);

CREATE INDEX sync_batches_created_idx ON sync_batches (created_at);

CREATE TABLE sync_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_id uuid NOT NULL,
    device_id uuid REFERENCES devices (id) ON DELETE SET NULL,
    reason text NOT NULL,
    incoming jsonb NOT NULL,
    stored jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,

    CONSTRAINT sync_conflicts_reason_known CHECK (
        reason IN ('stale_revision', 'deleted_on_server', 'clock_skew')
    )
);

CREATE INDEX sync_conflicts_open_idx
    ON sync_conflicts (user_id, created_at DESC)
    WHERE resolved_at IS NULL;

-- Normal app edits do not set `updated_at`, so the existing trigger stamps
-- them. A sync push does set the client timestamp, and it must survive.
CREATE OR REPLACE FUNCTION set_updated_at_preserve_client()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
        RETURN NEW;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER items_set_updated_at ON items;
CREATE TRIGGER items_set_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_preserve_client();
