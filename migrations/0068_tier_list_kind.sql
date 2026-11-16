-- T152.1: a tier list can be constrained to one catalogue kind.
ALTER TABLE tier_lists
    ADD COLUMN kind text NOT NULL DEFAULT 'all';

ALTER TABLE tier_lists
    ADD CONSTRAINT tier_lists_kind_known
    CHECK (kind IN ('all', 'movie', 'tv', 'anime', 'book', 'game', 'image', 'other'));
