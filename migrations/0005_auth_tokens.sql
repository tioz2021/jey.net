-- One-time tokens for email confirmation and password reset.
--
-- Only the SHA-256 hash is stored; the raw token exists in the letter and in
-- the client's request. A token is single-use and has an expiry.

CREATE TABLE auth_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose text NOT NULL,
    token_hash bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,

    CONSTRAINT auth_tokens_purpose_known CHECK (
        purpose IN ('email_verification', 'password_reset')
    ),
    CONSTRAINT auth_tokens_hash_unique UNIQUE (token_hash),
    CONSTRAINT auth_tokens_expiry_order CHECK (expires_at > created_at)
);

CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
