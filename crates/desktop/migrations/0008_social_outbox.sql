-- T172c: queued social writes that are not part of the item sync outbox.
CREATE TABLE social_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX social_outbox_user_idx ON social_outbox (user_id, id);
