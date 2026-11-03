-- What a public profile may show, and which records opt out entirely.
ALTER TABLE users
    ADD COLUMN public_statuses text[] NOT NULL DEFAULT ARRAY['done']::text[],
    ADD COLUMN public_show_progress boolean NOT NULL DEFAULT true;

ALTER TABLE users
    ADD CONSTRAINT users_public_statuses_known CHECK (
        public_statuses <@ ARRAY['planned', 'in_progress', 'done', 'dropped']::text[]
    );

ALTER TABLE items
    ADD COLUMN public_hidden boolean NOT NULL DEFAULT false;
