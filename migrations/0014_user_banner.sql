-- Optional profile banner: a wide WebP shown behind the avatar on the
-- public profile. The file lives in object storage like other renditions.
ALTER TABLE users ADD COLUMN banner_key text;
