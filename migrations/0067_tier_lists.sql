-- T152: personal/public S-D tier lists made from catalogue items.
CREATE TABLE tier_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title text NOT NULL,
    slug text NOT NULL,
    visibility text NOT NULL DEFAULT 'private',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tier_lists_title_length CHECK (char_length(title) BETWEEN 1 AND 80),
    CONSTRAINT tier_lists_visibility_known CHECK (visibility IN ('private', 'public')),
    CONSTRAINT tier_lists_user_slug_unique UNIQUE (user_id, slug)
);

CREATE TABLE tier_list_items (
    tier_list_id uuid NOT NULL REFERENCES tier_lists (id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    tier text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (tier_list_id, item_id),
    CONSTRAINT tier_list_items_tier_known CHECK (tier IN ('S', 'A', 'B', 'C', 'D'))
);

CREATE INDEX tier_lists_user_updated_idx ON tier_lists (user_id, updated_at DESC);
CREATE INDEX tier_list_items_order_idx ON tier_list_items (tier_list_id, tier, position);
