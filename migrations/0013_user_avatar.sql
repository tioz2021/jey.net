-- Profile picture: the storage key of the 128 px square WebP.

ALTER TABLE users
    ADD COLUMN avatar_key text;
