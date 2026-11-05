CREATE OR REPLACE FUNCTION jey_slug(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(both '-' from regexp_replace(
        translate(lower(coalesce(value, '')),
            'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
            'abvgdeezziyklmnoprstufhccss_y_eua'),
        '[^a-z0-9]+', '-', 'g'
    ));
$$;

ALTER TABLE items ADD COLUMN slug citext;

UPDATE items SET slug = NULLIF(jey_slug(title), '');
UPDATE items
SET slug = 'item-' || substr(replace(id::text, '-', ''), 1, 8)
WHERE slug IS NULL;

WITH ranked AS (
    SELECT id, slug,
           row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS position
    FROM items
)
UPDATE items i
SET slug = ranked.slug || '-' || substr(replace(i.id::text, '-', ''), 1, 6)
FROM ranked
WHERE ranked.id = i.id AND ranked.position > 1;

CREATE UNIQUE INDEX items_slug_unique ON items (slug);
ALTER TABLE items ALTER COLUMN slug SET NOT NULL;

CREATE FUNCTION items_set_slug() RETURNS trigger AS $$
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
    WHILE EXISTS (SELECT 1 FROM items WHERE slug = candidate AND id <> NEW.id) LOOP
        suffix := suffix + 1;
        candidate := base || '-' || suffix;
    END LOOP;
    NEW.slug := candidate;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_set_slug_before_insert
    BEFORE INSERT ON items
    FOR EACH ROW
    EXECUTE FUNCTION items_set_slug();
