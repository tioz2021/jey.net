-- Accounts of the portal.
--
-- Users belong to the server: devices synchronise their content to an account,
-- but the account itself is not a synchronised record. Soft deletion keeps the
-- row (and the data) until the purge task removes it for good.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id uuid PRIMARY KEY,
    email citext NOT NULL,
    email_verified_at timestamptz,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    locale text NOT NULL DEFAULT 'ru',
    is_public boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,

    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_length CHECK (char_length(email::text) <= 254),
    CONSTRAINT users_display_name_trimmed CHECK (display_name = btrim(display_name)),
    CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 60),
    CONSTRAINT users_locale_format CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

CREATE INDEX users_deleted_at_idx ON users (deleted_at);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
