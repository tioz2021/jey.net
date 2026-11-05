-- Per-user in-app notification switches. Email and push are intentionally absent.
ALTER TABLE users
    ADD COLUMN notification_prefs jsonb NOT NULL
    DEFAULT '{"follow": true, "item": true, "comment": true, "reaction": true}'::jsonb;
