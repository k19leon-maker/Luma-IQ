DELETE FROM "products"
WHERE
  COALESCE("title", '') ILIKE '%8 недель к близости%'
  OR COALESCE("title", '') ILIKE '%Первый шаг%'
  OR COALESCE("title", '') ILIKE '%5 причин почему пары ссорятся%'
  OR COALESCE("title", '') ILIKE '%5 фраз%'
  OR COALESCE("shortDescription", '') ILIKE '%8 недель к близости%'
  OR COALESCE("shortDescription", '') ILIKE '%разрушают доверие%'
  OR COALESCE("shortDescription", '') ILIKE '%пар в кризисе%'
  OR COALESCE("shortDescription", '') ILIKE '%групповая программа для пар%';

UPDATE "projects"
SET "strategyData" = jsonb_set(
  "strategyData",
  '{materialsData}',
  COALESCE(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements("strategyData"->'materialsData') AS item
      WHERE NOT (
        item->>'kind' IN ('product-main', 'product-mini', 'lead-magnet')
        AND (
          item::text ILIKE '%8 недель к близости%'
          OR item::text ILIKE '%5 фраз%разрушают доверие%'
          OR item::text ILIKE '%5 причин почему пары ссорятся%'
          OR item::text ILIKE '%Первый шаг%пар в кризисе%'
          OR item::text ILIKE '%групповая программа для пар%'
        )
      )
    ),
    '[]'::jsonb
  ),
  true
)
WHERE "strategyData" ? 'materialsData'
  AND jsonb_typeof("strategyData"->'materialsData') = 'array';

UPDATE "projects"
SET "strategyData" = jsonb_set(
  "strategyData",
  '{generatedData}',
  COALESCE(
    (
      SELECT jsonb_object_agg(key, value)
      FROM jsonb_each("strategyData"->'generatedData')
      WHERE NOT (
        key IN ('productMain', 'productMini', 'leadMagnet')
        AND (
          value::text ILIKE '%8 недель к близости%'
          OR value::text ILIKE '%5 фраз%разрушают доверие%'
          OR value::text ILIKE '%5 причин почему пары ссорятся%'
          OR value::text ILIKE '%Первый шаг%пар в кризисе%'
          OR value::text ILIKE '%групповая программа для пар%'
        )
      )
    ),
    '{}'::jsonb
  ),
  true
)
WHERE "strategyData" ? 'generatedData'
  AND jsonb_typeof("strategyData"->'generatedData') = 'object';
