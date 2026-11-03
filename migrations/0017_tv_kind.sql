-- TV series share the item table with films and books. A series can be
-- "in progress", so it needs its own kind instead of overloading movie.

ALTER TABLE items DROP CONSTRAINT items_kind_known;
ALTER TABLE items ADD CONSTRAINT items_kind_known CHECK (
    kind IN ('movie', 'tv', 'book', 'image', 'other')
);
