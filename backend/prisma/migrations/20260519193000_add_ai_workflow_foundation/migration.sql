-- AI orchestration foundation: lightweight workflow runs, steps, and artifacts.
-- This intentionally avoids a distributed workflow engine and keeps orchestration
-- observable inside the existing Postgres/Prisma stack.

ALTER TABLE "ai_generations"
  ADD COLUMN "workflowRunId" TEXT,
  ADD COLUMN "workflowStepId" TEXT;

CREATE TABLE "ai_workflow_runs" (
  "id" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "featureCode" TEXT,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "input" JSONB,
  "output" JSONB,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_steps" (
  "id" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "input" JSONB,
  "output" JSONB,
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_artifacts" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "step" TEXT,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workflowRunId" TEXT,
  "workflowStepId" TEXT,
  "generationId" TEXT,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "structured" JSONB,
  "metadata" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_generations_workflowRunId_idx" ON "ai_generations"("workflowRunId");
CREATE INDEX "ai_generations_workflowStepId_idx" ON "ai_generations"("workflowStepId");

CREATE INDEX "ai_workflow_runs_userId_createdAt_idx" ON "ai_workflow_runs"("userId", "createdAt");
CREATE INDEX "ai_workflow_runs_projectId_createdAt_idx" ON "ai_workflow_runs"("projectId", "createdAt");
CREATE INDEX "ai_workflow_runs_workflow_status_idx" ON "ai_workflow_runs"("workflow", "status");

CREATE INDEX "ai_workflow_steps_workflowRunId_step_idx" ON "ai_workflow_steps"("workflowRunId", "step");
CREATE INDEX "ai_workflow_steps_status_createdAt_idx" ON "ai_workflow_steps"("status", "createdAt");

CREATE INDEX "ai_artifacts_userId_createdAt_idx" ON "ai_artifacts"("userId", "createdAt");
CREATE INDEX "ai_artifacts_projectId_createdAt_idx" ON "ai_artifacts"("projectId", "createdAt");
CREATE INDEX "ai_artifacts_workflow_step_idx" ON "ai_artifacts"("workflow", "step");
CREATE INDEX "ai_artifacts_type_createdAt_idx" ON "ai_artifacts"("type", "createdAt");
CREATE INDEX "ai_artifacts_workflowRunId_idx" ON "ai_artifacts"("workflowRunId");
CREATE INDEX "ai_artifacts_workflowStepId_idx" ON "ai_artifacts"("workflowStepId");

ALTER TABLE "ai_workflow_runs"
  ADD CONSTRAINT "ai_workflow_runs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_runs"
  ADD CONSTRAINT "ai_workflow_runs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_steps"
  ADD CONSTRAINT "ai_workflow_steps_workflowRunId_fkey"
  FOREIGN KEY ("workflowRunId") REFERENCES "ai_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_artifacts"
  ADD CONSTRAINT "ai_artifacts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_artifacts"
  ADD CONSTRAINT "ai_artifacts_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_artifacts"
  ADD CONSTRAINT "ai_artifacts_workflowRunId_fkey"
  FOREIGN KEY ("workflowRunId") REFERENCES "ai_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_artifacts"
  ADD CONSTRAINT "ai_artifacts_workflowStepId_fkey"
  FOREIGN KEY ("workflowStepId") REFERENCES "ai_workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_generations"
  ADD CONSTRAINT "ai_generations_workflowRunId_fkey"
  FOREIGN KEY ("workflowRunId") REFERENCES "ai_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_generations"
  ADD CONSTRAINT "ai_generations_workflowStepId_fkey"
  FOREIGN KEY ("workflowStepId") REFERENCES "ai_workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
