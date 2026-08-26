CREATE UNIQUE INDEX IF NOT EXISTS "content_plan_items_tg_source_unique"
ON "content_plan_items" ("projectId", "sourceId")
WHERE "sourceId" LIKE 'tg-channel:%';
