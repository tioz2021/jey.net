-- Private notes are never part of the public record payload.
ALTER TABLE items ADD COLUMN body text;

ALTER TABLE items ADD CONSTRAINT items_body_length
    CHECK (body IS NULL OR char_length(body) <= 20000);
