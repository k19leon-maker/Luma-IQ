-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CreditLedgerType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'REFUND', 'ADJUST', 'EXPIRE');

-- CreateEnum
CREATE TYPE "CreditLedgerSource" AS ENUM ('PLAN', 'ADMIN', 'TRIBUTE', 'PROMO', 'AI_GENERATION', 'REFUND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'GROK', 'OTHER');

-- CreateEnum
CREATE TYPE "GenerationClass" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME');

-- CreateEnum
CREATE TYPE "FeaturePricingMode" AS ENUM ('FIXED', 'TOKEN_BASED', 'HYBRID');

-- CreateEnum
CREATE TYPE "AIGenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "AIUsageEventType" AS ENUM ('REQUESTED', 'RESERVED', 'STARTED', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planCode" TEXT NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsRemainingSnapshot" INTEGER NOT NULL DEFAULT 0,
    "costTotalUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "costTotalRub" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "billingPeriodId" TEXT,
    "type" "CreditLedgerType" NOT NULL,
    "source" "CreditLedgerSource" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_pricing" (
    "id" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputPricePer1M" DECIMAL(18,8) NOT NULL,
    "outputPricePer1M" DECIMAL(18,8) NOT NULL,
    "cachedInputPricePer1M" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_pricing" (
    "id" TEXT NOT NULL,
    "featureCode" TEXT NOT NULL,
    "generationClass" "GenerationClass" NOT NULL,
    "creditPrice" INTEGER NOT NULL,
    "minCredits" INTEGER NOT NULL DEFAULT 0,
    "maxCredits" INTEGER,
    "pricingMode" "FeaturePricingMode" NOT NULL DEFAULT 'FIXED',
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "billingPeriodId" TEXT,
    "featureCode" TEXT NOT NULL,
    "featureGroup" TEXT,
    "generationClass" "GenerationClass" NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT,
    "status" "AIGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "requestHash" TEXT,
    "idempotencyKey" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "actualCostUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "actualCostRub" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "creditsRefunded" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "promptVersion" TEXT,
    "contextVersion" TEXT,
    "pricingSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "generationId" TEXT,
    "eventType" "AIUsageEventType" NOT NULL,
    "featureCode" TEXT,
    "provider" "AIProvider",
    "model" TEXT,
    "creditsDelta" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_usage_daily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "featureCode" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_periods_userId_periodStart_periodEnd_idx" ON "billing_periods"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "billing_periods_subscriptionId_idx" ON "billing_periods"("subscriptionId");

-- CreateIndex
CREATE INDEX "billing_periods_status_idx" ON "billing_periods"("status");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_createdAt_idx" ON "credit_ledger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_projectId_createdAt_idx" ON "credit_ledger"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_billingPeriodId_idx" ON "credit_ledger"("billingPeriodId");

-- CreateIndex
CREATE INDEX "credit_ledger_type_idx" ON "credit_ledger"("type");

-- CreateIndex
CREATE INDEX "credit_ledger_source_idx" ON "credit_ledger"("source");

-- CreateIndex
CREATE INDEX "ai_model_pricing_provider_model_validFrom_idx" ON "ai_model_pricing"("provider", "model", "validFrom");

-- CreateIndex
CREATE INDEX "ai_model_pricing_validTo_idx" ON "ai_model_pricing"("validTo");

-- CreateIndex
CREATE INDEX "feature_pricing_featureCode_isActive_idx" ON "feature_pricing"("featureCode", "isActive");

-- CreateIndex
CREATE INDEX "feature_pricing_generationClass_idx" ON "feature_pricing"("generationClass");

-- CreateIndex
CREATE INDEX "feature_pricing_validFrom_validTo_idx" ON "feature_pricing"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generations_idempotencyKey_key" ON "ai_generations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_generations_userId_createdAt_idx" ON "ai_generations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_projectId_createdAt_idx" ON "ai_generations"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_billingPeriodId_idx" ON "ai_generations"("billingPeriodId");

-- CreateIndex
CREATE INDEX "ai_generations_featureCode_createdAt_idx" ON "ai_generations"("featureCode", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_provider_model_createdAt_idx" ON "ai_generations"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_status_createdAt_idx" ON "ai_generations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_requestHash_idx" ON "ai_generations"("requestHash");

-- CreateIndex
CREATE INDEX "ai_usage_events_userId_createdAt_idx" ON "ai_usage_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_events_projectId_createdAt_idx" ON "ai_usage_events"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_events_generationId_idx" ON "ai_usage_events"("generationId");

-- CreateIndex
CREATE INDEX "ai_usage_events_eventType_createdAt_idx" ON "ai_usage_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_events_featureCode_createdAt_idx" ON "ai_usage_events"("featureCode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_usage_daily_date_userId_projectId_featureCode_key" ON "feature_usage_daily"("date", "userId", "projectId", "featureCode");

-- CreateIndex
CREATE INDEX "feature_usage_daily_date_userId_idx" ON "feature_usage_daily"("date", "userId");

-- CreateIndex
CREATE INDEX "feature_usage_daily_date_projectId_idx" ON "feature_usage_daily"("date", "projectId");

-- CreateIndex
CREATE INDEX "feature_usage_daily_date_featureCode_idx" ON "feature_usage_daily"("date", "featureCode");

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage_daily" ADD CONSTRAINT "feature_usage_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage_daily" ADD CONSTRAINT "feature_usage_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
