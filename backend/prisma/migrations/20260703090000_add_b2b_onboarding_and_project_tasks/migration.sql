ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onboardingVersion" TEXT NOT NULL DEFAULT 'b2b_v1',
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingData" JSONB,
  ADD COLUMN IF NOT EXISTS "recommendedRoute" TEXT,
  ADD COLUMN IF NOT EXISTS "createdProjectId" TEXT;

UPDATE "users" u
SET
  "onboardingStatus" = 'completed',
  "onboardingStep" = 5,
  "onboardingVersion" = 'b2b_v1',
  "onboardingCompletedAt" = COALESCE(u."onboardingCompletedAt", NOW()),
  "recommendedRoute" = COALESCE(u."recommendedRoute", '/app/tasks'),
  "createdProjectId" = COALESCE(u."createdProjectId", p.id)
FROM (
  SELECT DISTINCT ON ("userId") "userId", id
  FROM "projects"
  ORDER BY "userId", "createdAt" ASC
) p
WHERE p."userId" = u.id
  AND u."onboardingStatus" = 'not_started';

CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'backlog',
  "dueBucket" TEXT NOT NULL DEFAULT 'backlog',
  "route" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT,
  "taskPlanVersion" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_tasks_projectId_source_taskPlanVersion_sortOrder_key"
  ON "project_tasks"("projectId", "source", "taskPlanVersion", "sortOrder");

CREATE INDEX IF NOT EXISTS "project_tasks_projectId_status_sortOrder_idx"
  ON "project_tasks"("projectId", "status", "sortOrder");

CREATE INDEX IF NOT EXISTS "project_tasks_projectId_dueBucket_sortOrder_idx"
  ON "project_tasks"("projectId", "dueBucket", "sortOrder");

CREATE INDEX IF NOT EXISTS "project_tasks_userId_createdAt_idx"
  ON "project_tasks"("userId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "project_tasks"
    ADD CONSTRAINT "project_tasks_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "project_tasks"
    ADD CONSTRAINT "project_tasks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
