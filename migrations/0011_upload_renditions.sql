-- Uploaded images get two WebP renditions: a 1200 px "large" and a 400 px
-- preview. The original keeps its own key, the renditions get theirs.

ALTER TABLE uploads
    ADD COLUMN width integer,
    ADD COLUMN height integer,
    ADD COLUMN large_key text,
    ADD COLUMN preview_key text;
