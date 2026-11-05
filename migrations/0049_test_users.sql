ALTER TABLE users ADD COLUMN is_test boolean NOT NULL DEFAULT false;
CREATE INDEX users_is_test_idx ON users (is_test) WHERE is_test;
