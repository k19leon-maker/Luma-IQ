ALTER TABLE "ai_model_pricing"
  ADD COLUMN "audioInputPricePer1M" DECIMAL(18,8),
  ADD COLUMN "audioOutputPricePer1M" DECIMAL(18,8);

CREATE TABLE "ai_model_profile_versions" (
  "id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL,
  "actualModelId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_model_profile_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_model_profile_versions_alias_isActive_validFrom_idx"
  ON "ai_model_profile_versions"("alias", "isActive", "validFrom");
CREATE INDEX "ai_model_profile_versions_provider_actualModelId_idx"
  ON "ai_model_profile_versions"("provider", "actualModelId");

CREATE TABLE "ai_action_definition_versions" (
  "id" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "pipeline" JSONB NOT NULL,
  "contextBudget" INTEGER NOT NULL,
  "outputLimit" INTEGER NOT NULL,
  "retryPolicy" JSONB NOT NULL,
  "fallbackPolicy" JSONB NOT NULL,
  "batchEligible" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_action_definition_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_action_definition_versions_actionKey_isActive_validFrom_idx"
  ON "ai_action_definition_versions"("actionKey", "isActive", "validFrom");

CREATE TABLE "ai_action_pricing_versions" (
  "id" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "aiPoints" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_action_pricing_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_action_pricing_versions_actionKey_isActive_validFrom_idx"
  ON "ai_action_pricing_versions"("actionKey", "isActive", "validFrom");

CREATE TABLE "ai_feature_flags" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_feature_flags_key_key" ON "ai_feature_flags"("key");

CREATE TABLE "ai_configuration_audit_logs" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "configType" TEXT NOT NULL,
  "configKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_configuration_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_configuration_audit_logs_configType_configKey_createdAt_idx"
  ON "ai_configuration_audit_logs"("configType", "configKey", "createdAt");
CREATE INDEX "ai_configuration_audit_logs_actorUserId_createdAt_idx"
  ON "ai_configuration_audit_logs"("actorUserId", "createdAt");

UPDATE "ai_generations"
SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"accountingVersion":"legacy"}'::jsonb
WHERE "metadata" IS NULL OR NOT ("metadata" ? 'accountingVersion');

UPDATE "ai_usage_events"
SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"accountingVersion":"legacy"}'::jsonb
WHERE "metadata" IS NULL OR NOT ("metadata" ? 'accountingVersion');
