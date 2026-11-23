-- T200: structured client-side errors, without request bodies or secrets.
CREATE TABLE client_errors (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    route text NOT NULL,
    scope text NOT NULL,
    message text NOT NULL,
    stack text,
    app_version text NOT NULL,
    request_id text,
    user_agent text
);

CREATE INDEX client_errors_created_idx ON client_errors (created_at DESC);
CREATE INDEX client_errors_scope_idx ON client_errors (scope, created_at DESC);
