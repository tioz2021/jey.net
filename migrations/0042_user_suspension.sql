ALTER TABLE users ADD COLUMN suspended_at timestamptz;
CREATE INDEX users_suspended_at_idx ON users (suspended_at) WHERE suspended_at IS NOT NULL;
