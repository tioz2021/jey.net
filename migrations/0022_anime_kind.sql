-- Anime records share the item table with the other media kinds.
ALTER TABLE items DROP CONSTRAINT items_kind_known;
ALTER TABLE items ADD CONSTRAINT items_kind_known CHECK (
    kind IN ('movie', 'tv', 'book', 'game', 'anime', 'image', 'other')
);
