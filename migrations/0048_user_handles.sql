ALTER TABLE users ADD COLUMN handle citext;

UPDATE users
SET handle = NULLIF(lower(regexp_replace(display_name, '[^A-Za-z0-9]+', '', 'g')), '');

-- Non-Latin names get a stable, readable fallback; they can change it later.
UPDATE users
SET handle = 'user-' || substr(replace(id::text, '-', ''), 1, 10)
WHERE handle IS NULL;

WITH ranked AS (
    SELECT id, handle,
           row_number() OVER (PARTITION BY handle ORDER BY created_at, id) AS position
    FROM users
)
UPDATE users u
SET handle = ranked.handle || '-' || substr(replace(u.id::text, '-', ''), 1, 6)
FROM ranked
WHERE ranked.id = u.id AND ranked.position > 1;

CREATE UNIQUE INDEX users_handle_unique ON users (handle);
ALTER TABLE users ALTER COLUMN handle SET NOT NULL;
