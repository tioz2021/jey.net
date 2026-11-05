-- Likes on comments.
CREATE TABLE comment_reactions (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX comment_reactions_comment_idx
    ON comment_reactions (comment_id, created_at DESC);
