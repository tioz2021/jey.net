-- Conflict copies for social entities.
--
-- Items already have sync_conflicts. Collections and comments are created with
-- client ids, so a duplicate id means two devices changed the same base while
-- offline. Keep the losing incoming payload next to the stored row instead of
-- silently dropping it.

CREATE TABLE social_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    entity text NOT NULL,
    entity_id uuid NOT NULL,
    incoming jsonb NOT NULL,
    stored jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,

    CONSTRAINT social_conflicts_entity_known CHECK (entity IN ('collection', 'comment'))
);

CREATE INDEX social_conflicts_open_idx
    ON social_conflicts (user_id, created_at DESC)
    WHERE resolved_at IS NULL;
