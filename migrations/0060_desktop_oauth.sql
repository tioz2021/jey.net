-- One-time desktop OAuth handoff.
--
-- The browser finishes Google on the server, then redirects to a loopback
-- listener with a short-lived code. The desktop exchanges that code plus its
-- PKCE verifier for a normal session token.

CREATE TABLE oauth_desktop (
    state text PRIMARY KEY,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    user_id uuid REFERENCES users (id) ON DELETE CASCADE,
    code_hash bytea UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);

CREATE INDEX oauth_desktop_expiry_idx ON oauth_desktop (expires_at);
