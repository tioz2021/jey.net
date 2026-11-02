-- Disk usage of an upload: original plus both WebP renditions.
-- Quotas are counted from this column, not from the original size.

ALTER TABLE uploads
    ADD COLUMN total_bytes bigint NOT NULL DEFAULT 0;
