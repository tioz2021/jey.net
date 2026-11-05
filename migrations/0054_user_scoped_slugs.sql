DROP INDEX IF EXISTS items_slug_unique;

WITH bases AS (
    SELECT id, user_id,
           coalesce(
               NULLIF(jey_slug(title), ''),
               'item-' || substr(replace(id::text, '-', ''), 1, 8)
           ) AS base,
           row_number() OVER (
               PARTITION BY user_id, coalesce(
                   NULLIF(jey_slug(title), ''),
                   'item-' || substr(replace(id::text, '-', ''), 1, 8)
               )
               ORDER BY created_at, id
           ) AS position
    FROM items
)
UPDATE items i
SET slug = bases.base || CASE WHEN bases.position = 1 THEN '' ELSE '-' || bases.position END
FROM bases
WHERE bases.id = i.id;

CREATE UNIQUE INDEX items_slug_user_unique ON items (user_id, slug);

CREATE OR REPLACE FUNCTION items_set_slug() RETURNS trigger AS $$
DECLARE
    base text;
    candidate text;
    suffix integer := 0;
BEGIN
    IF NEW.slug IS NOT NULL THEN
        RETURN NEW;
    END IF;
    base := NULLIF(jey_slug(NEW.title), '');
    IF base IS NULL THEN
        base := 'item-' || substr(replace(NEW.id::text, '-', ''), 1, 8);
    END IF;
    candidate := base;
    WHILE EXISTS (
        SELECT 1 FROM items
        WHERE slug = candidate AND user_id = NEW.user_id AND id <> NEW.id
    ) LOOP
        suffix := suffix + 1;
        candidate := base || '-' || suffix;
    END LOOP;
    NEW.slug := candidate;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
