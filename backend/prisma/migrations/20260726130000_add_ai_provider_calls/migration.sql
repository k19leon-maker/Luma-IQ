ALTER TABLE "ai_generations"
  ADD COLUMN "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "audioInputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "audioOutputTokens" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ai_provider_calls" (
  "id" TEXT NOT NULL,
  "generationId" TEXT,
  "workflowRunId" TEXT,
  "workflowStepId" TEXT,
  "userId" TEXT,
  "projectId" TEXT,
  "correlationId" TEXT,
  "responseId" TEXT,
  "provider" "AIProvider" NOT NULL,
  "modelAlias" TEXT,
  "actualModelId" TEXT NOT NULL,
  "modelSnapshot" JSONB,
  "promptVersion" TEXT,
  "actionKey" TEXT NOT NULL,
  "pipeline" TEXT,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "audioInputTokens" INTEGER NOT NULL DEFAULT 0,
  "audioOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "retryIndex" INTEGER NOT NULL DEFAULT 0,
  "isBatch" BOOLEAN NOT NULL DEFAULT false,
  "costUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "pricingSnapshot" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_provider_calls_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_provider_calls"
  ADD CONSTRAINT "ai_provider_calls_generationId_fkey"
  FOREIGN KEY ("generationId") REFERENCES "ai_generations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_provider_calls_generationId_createdAt_idx" ON "ai_provider_calls"("generationId", "createdAt");
CREATE INDEX "ai_provider_calls_workflowRunId_workflowStepId_idx" ON "ai_provider_calls"("workflowRunId", "workflowStepId");
CREATE INDEX "ai_provider_calls_userId_createdAt_idx" ON "ai_provider_calls"("userId", "createdAt");
CREATE INDEX "ai_provider_calls_projectId_createdAt_idx" ON "ai_provider_calls"("projectId", "createdAt");
CREATE INDEX "ai_provider_calls_correlationId_createdAt_idx" ON "ai_provider_calls"("correlationId", "createdAt");
CREATE INDEX "ai_provider_calls_actionKey_stage_createdAt_idx" ON "ai_provider_calls"("actionKey", "stage", "createdAt");
CREATE INDEX "ai_provider_calls_provider_actualModelId_createdAt_idx" ON "ai_provider_calls"("provider", "actualModelId", "createdAt");
CREATE INDEX "ai_provider_calls_status_createdAt_idx" ON "ai_provider_calls"("status", "createdAt");
CREATE INDEX "ai_provider_calls_responseId_idx" ON "ai_provider_calls"("responseId");
