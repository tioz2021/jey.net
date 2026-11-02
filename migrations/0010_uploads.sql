-- Uploaded files: the row describes the file, the bytes live in storage.
--
-- `storage_key` is relative to the media root and is unique, so the same file
-- can never be written twice. `sha256` lets us find duplicates per user later.

CREATE TABLE uploads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    mime text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 bytea NOT NULL,
    storage_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uploads_mime_known CHECK (
        mime IN ('image/jpeg', 'image/png', 'image/webp')
    ),
    CONSTRAINT uploads_size_positive CHECK (size_bytes > 0)
);

CREATE INDEX uploads_user_created_idx ON uploads (user_id, created_at DESC);
CREATE INDEX uploads_user_sha256_idx ON uploads (user_id, sha256);
