ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'viewer', 'moderator', 'admin'));

UPDATE users SET role = 'admin' WHERE is_admin;
CREATE INDEX users_role_idx ON users (role) WHERE role <> 'user';
