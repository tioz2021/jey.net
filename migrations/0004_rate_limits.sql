-- Fixed-window counters for brute-force protection.
--
-- Counters live in PostgreSQL so they survive restarts and keep working with
-- more than one API instance. Rows are tiny; stale ones are deleted
-- opportunistically by the rate limiter itself.

CREATE TABLE rate_limits (
    key text PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    attempts integer NOT NULL,
    blocked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT rate_limits_attempts_non_negative CHECK (attempts >= 0)
);

CREATE INDEX rate_limits_updated_at_idx ON rate_limits (updated_at);
