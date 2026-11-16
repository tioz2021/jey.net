-- T152.2: agreed rating scale.
UPDATE tier_list_items ti
SET tier = CASE
    WHEN i.rating = 10 THEN 'S'
    WHEN i.rating = 9 THEN 'A'
    WHEN i.rating BETWEEN 7 AND 8 THEN 'B'
    WHEN i.rating BETWEEN 5 AND 6 THEN 'C'
    WHEN i.rating BETWEEN 3 AND 4 THEN 'D'
    WHEN i.rating = 2 THEN 'E'
    ELSE 'F'
END
FROM items i, tier_lists t
WHERE ti.item_id = i.id
  AND t.id = ti.tier_list_id
  AND t.auto
  AND i.rating BETWEEN 1 AND 10;
