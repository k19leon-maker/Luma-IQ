ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "key" TEXT;

CREATE INDEX IF NOT EXISTS "project_tasks_projectId_source_taskPlanVersion_key_idx"
  ON "project_tasks"("projectId", "source", "taskPlanVersion", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "project_tasks_starter_key_unique_idx"
  ON "project_tasks"("projectId", "source", "taskPlanVersion", "key")
  WHERE "key" IS NOT NULL
    AND "source" IS NOT NULL
    AND "taskPlanVersion" IS NOT NULL;
