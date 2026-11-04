-- IGDB game records share the item table with films, series and books.
ALTER TABLE items DROP CONSTRAINT items_kind_known;
ALTER TABLE items ADD CONSTRAINT items_kind_known CHECK (
    kind IN ('movie', 'tv', 'book', 'game', 'image', 'other')
);
