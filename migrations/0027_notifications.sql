-- In-app notifications. The first event is a new follower.
CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT notifications_no_self CHECK (user_id <> actor_id),
    CONSTRAINT notifications_kind CHECK (kind IN ('follow'))
);

CREATE UNIQUE INDEX notifications_follow_once
    ON notifications (user_id, actor_id, kind);
CREATE INDEX notifications_user_idx
    ON notifications (user_id, created_at DESC);
