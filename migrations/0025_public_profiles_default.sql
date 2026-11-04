-- New accounts start with an open public page; privacy remains opt-out.
ALTER TABLE users ALTER COLUMN is_public SET DEFAULT true;
