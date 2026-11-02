-- Shared trigger function that keeps `updated_at` in sync.
--
-- Every table with an `updated_at` column attaches this function with
-- `CREATE TRIGGER ... BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()`.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
