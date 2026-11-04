-- Per-subscription notification switch; default is on.
ALTER TABLE follows
    ADD COLUMN notifications boolean NOT NULL DEFAULT true;
