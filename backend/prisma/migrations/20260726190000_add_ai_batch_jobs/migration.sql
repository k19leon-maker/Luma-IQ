CREATE TABLE "ai_batch_jobs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "featureCode" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL DEFAULT 'OPENAI',
  "providerBatchId" TEXT,
  "inputFileId" TEXT,
  "outputFileId" TEXT,
  "errorFileId" TEXT,
  "totalItems" INTEGER NOT NULL,
  "completedItems" INTEGER NOT NULL DEFAULT 0,
  "failedItems" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "errorMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "inProgressAt" TIMESTAMP(3),
  "finalizingAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_batch_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_batch_items" (
  "id" TEXT NOT NULL,
  "batchJobId" TEXT NOT NULL,
  "customId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "input" JSONB NOT NULL,
  "output" JSONB,
  "error" JSONB,
  "generationId" TEXT,
  "artifactId" TEXT,
  "aiPoints" INTEGER NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_batch_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_batch_jobs_idempotencyKey_key" ON "ai_batch_jobs"("idempotencyKey");
CREATE UNIQUE INDEX "ai_batch_jobs_providerBatchId_key" ON "ai_batch_jobs"("providerBatchId");
CREATE INDEX "ai_batch_jobs_userId_createdAt_idx" ON "ai_batch_jobs"("userId", "createdAt");
CREATE INDEX "ai_batch_jobs_projectId_createdAt_idx" ON "ai_batch_jobs"("projectId", "createdAt");
CREATE INDEX "ai_batch_jobs_status_updatedAt_idx" ON "ai_batch_jobs"("status", "updatedAt");
CREATE INDEX "ai_batch_jobs_actionKey_createdAt_idx" ON "ai_batch_jobs"("actionKey", "createdAt");

CREATE UNIQUE INDEX "ai_batch_items_generationId_key" ON "ai_batch_items"("generationId");
CREATE UNIQUE INDEX "ai_batch_items_batchJobId_customId_key" ON "ai_batch_items"("batchJobId", "customId");
CREATE INDEX "ai_batch_items_batchJobId_position_idx" ON "ai_batch_items"("batchJobId", "position");
CREATE INDEX "ai_batch_items_status_updatedAt_idx" ON "ai_batch_items"("status", "updatedAt");
CREATE INDEX "ai_batch_items_generationId_idx" ON "ai_batch_items"("generationId");

ALTER TABLE "ai_batch_jobs"
  ADD CONSTRAINT "ai_batch_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_batch_jobs"
  ADD CONSTRAINT "ai_batch_jobs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_batch_items"
  ADD CONSTRAINT "ai_batch_items_batchJobId_fkey"
  FOREIGN KEY ("batchJobId") REFERENCES "ai_batch_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
