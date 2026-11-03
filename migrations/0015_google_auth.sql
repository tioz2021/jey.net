-- Google sign-in: users may exist without a password, and the Google subject
-- is unique when present. Existing password accounts can be linked later.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_sub text;

CREATE UNIQUE INDEX users_google_sub_unique
    ON users (google_sub)
    WHERE google_sub IS NOT NULL;
