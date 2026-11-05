CREATE TABLE IF NOT EXISTS admin_actions (
    id bigserial PRIMARY KEY,
    admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
    admin_name text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    target_label text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_created_idx
    ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_admin_idx
    ON admin_actions (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_action_idx
    ON admin_actions (action, created_at DESC);
