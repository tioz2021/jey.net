CREATE TABLE site_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    announcement text,
    announcement_active boolean NOT NULL DEFAULT false,
    maintenance boolean NOT NULL DEFAULT false,
    registration_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
