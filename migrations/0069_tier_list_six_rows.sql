-- Reference UX uses S-F rows instead of S-D.
ALTER TABLE tier_list_items
    DROP CONSTRAINT tier_list_items_tier_known;

ALTER TABLE tier_list_items
    ADD CONSTRAINT tier_list_items_tier_known
    CHECK (tier IN ('S', 'A', 'B', 'C', 'D', 'E', 'F'));
