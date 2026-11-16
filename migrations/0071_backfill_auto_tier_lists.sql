-- Backfill automatic tier lists for ratings that existed before T152.2.
INSERT INTO tier_lists (user_id, title, slug, kind, visibility, auto)
SELECT DISTINCT
    i.user_id,
    'Авто: ' || i.kind,
    'auto-' || i.kind,
    i.kind,
    'private',
    true
FROM items i
WHERE i.deleted_at IS NULL
  AND i.rating IS NOT NULL
  AND i.rating BETWEEN 1 AND 10
  AND NOT EXISTS (
      SELECT 1 FROM tier_lists t
      WHERE t.user_id = i.user_id AND t.auto AND t.kind = i.kind
  )
ON CONFLICT (user_id, slug) DO NOTHING;

INSERT INTO tier_list_items (tier_list_id, item_id, tier, position)
SELECT
    t.id,
    i.id,
    CASE
        WHEN i.rating >= 9 THEN 'S'
        WHEN i.rating = 8 THEN 'A'
        WHEN i.rating >= 6 THEN 'B'
        WHEN i.rating >= 4 THEN 'C'
        WHEN i.rating = 3 THEN 'D'
        WHEN i.rating = 2 THEN 'E'
        ELSE 'F'
    END,
    row_number() OVER (PARTITION BY t.id ORDER BY i.rating DESC, i.created_at) - 1
FROM items i
JOIN tier_lists t
  ON t.user_id = i.user_id AND t.auto AND t.kind = i.kind
WHERE i.deleted_at IS NULL
  AND i.rating IS NOT NULL
  AND i.rating BETWEEN 1 AND 10
ON CONFLICT (tier_list_id, item_id) DO NOTHING;
