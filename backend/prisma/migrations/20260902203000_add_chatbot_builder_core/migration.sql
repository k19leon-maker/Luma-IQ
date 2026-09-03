CREATE TYPE "TelegramBotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISCONNECTED', 'ERROR', 'ARCHIVED');
CREATE TYPE "BotScenarioStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "BotScenarioVersionSource" AS ENUM ('MANUAL', 'AI', 'IMPORT');
CREATE TYPE "BotSubscriberStatus" AS ENUM ('ACTIVE', 'STOPPED', 'BLOCKED', 'ARCHIVED');
CREATE TYPE "BotMessageDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'DEAD');
CREATE TYPE "BotInboundUpdateStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD');

CREATE TABLE "telegram_bots" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "defaultProjectId" TEXT,
  "telegramBotId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "encryptedToken" TEXT,
  "tokenKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "tokenLast4" TEXT,
  "publicBotKey" TEXT NOT NULL,
  "webhookSecretHash" TEXT,
  "status" "TelegramBotStatus" NOT NULL DEFAULT 'DRAFT',
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastError" TEXT,
  "webhookConnectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_bots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_scenarios" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "BotScenarioStatus" NOT NULL DEFAULT 'DRAFT',
  "draftVersionId" TEXT,
  "publishedVersionId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_scenario_versions" (
  "id" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
  "definition" JSONB NOT NULL,
  "source" "BotScenarioVersionSource" NOT NULL DEFAULT 'MANUAL',
  "sourcePrompt" TEXT,
  "validationReport" JSONB,
  "sourceWorkflowRunId" TEXT,
  "sourceArtifactId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_scenario_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_subscribers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "languageCode" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "status" "BotSubscriberStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT,
  "startParameter" TEXT,
  "metadata" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stoppedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_tags" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_subscriber_tags" (
  "subscriberId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_subscriber_tags_pkey" PRIMARY KEY ("subscriberId", "tagId")
);

CREATE TABLE "bot_inbound_updates" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "telegramUpdateId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BotInboundUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_inbound_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bot_message_deliveries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "subscriberId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "scenarioVersionId" TEXT,
  "nodeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BotMessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3),
  "telegramMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_message_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_bots_telegramBotId_key" ON "telegram_bots"("telegramBotId");
CREATE UNIQUE INDEX "telegram_bots_publicBotKey_key" ON "telegram_bots"("publicBotKey");
CREATE INDEX "telegram_bots_userId_status_createdAt_idx" ON "telegram_bots"("userId", "status", "createdAt");
CREATE INDEX "telegram_bots_defaultProjectId_idx" ON "telegram_bots"("defaultProjectId");
CREATE INDEX "telegram_bots_deletedAt_idx" ON "telegram_bots"("deletedAt");

CREATE UNIQUE INDEX "bot_scenarios_draftVersionId_key" ON "bot_scenarios"("draftVersionId");
CREATE UNIQUE INDEX "bot_scenarios_publishedVersionId_key" ON "bot_scenarios"("publishedVersionId");
CREATE INDEX "bot_scenarios_userId_botId_status_idx" ON "bot_scenarios"("userId", "botId", "status");
CREATE INDEX "bot_scenarios_projectId_updatedAt_idx" ON "bot_scenarios"("projectId", "updatedAt");
CREATE INDEX "bot_scenarios_archivedAt_idx" ON "bot_scenarios"("archivedAt");

CREATE UNIQUE INDEX "bot_scenario_versions_scenarioId_version_key" ON "bot_scenario_versions"("scenarioId", "version");
CREATE INDEX "bot_scenario_versions_createdByUserId_createdAt_idx" ON "bot_scenario_versions"("createdByUserId", "createdAt");
CREATE INDEX "bot_scenario_versions_sourceWorkflowRunId_idx" ON "bot_scenario_versions"("sourceWorkflowRunId");
CREATE INDEX "bot_scenario_versions_sourceArtifactId_idx" ON "bot_scenario_versions"("sourceArtifactId");

CREATE UNIQUE INDEX "bot_subscribers_botId_telegramUserId_key" ON "bot_subscribers"("botId", "telegramUserId");
CREATE INDEX "bot_subscribers_userId_botId_status_idx" ON "bot_subscribers"("userId", "botId", "status");
CREATE INDEX "bot_subscribers_botId_lastSeenAt_idx" ON "bot_subscribers"("botId", "lastSeenAt");
CREATE INDEX "bot_subscribers_archivedAt_idx" ON "bot_subscribers"("archivedAt");

CREATE UNIQUE INDEX "bot_tags_botId_name_key" ON "bot_tags"("botId", "name");
CREATE INDEX "bot_tags_userId_botId_idx" ON "bot_tags"("userId", "botId");
CREATE INDEX "bot_subscriber_tags_tagId_assignedAt_idx" ON "bot_subscriber_tags"("tagId", "assignedAt");

CREATE UNIQUE INDEX "bot_inbound_updates_botId_telegramUpdateId_key" ON "bot_inbound_updates"("botId", "telegramUpdateId");
CREATE INDEX "bot_inbound_updates_userId_status_receivedAt_idx" ON "bot_inbound_updates"("userId", "status", "receivedAt");
CREATE INDEX "bot_inbound_updates_botId_status_receivedAt_idx" ON "bot_inbound_updates"("botId", "status", "receivedAt");

CREATE UNIQUE INDEX "bot_message_deliveries_botId_idempotencyKey_key" ON "bot_message_deliveries"("botId", "idempotencyKey");
CREATE INDEX "bot_message_deliveries_userId_status_scheduledAt_idx" ON "bot_message_deliveries"("userId", "status", "scheduledAt");
CREATE INDEX "bot_message_deliveries_botId_status_nextAttemptAt_idx" ON "bot_message_deliveries"("botId", "status", "nextAttemptAt");
CREATE INDEX "bot_message_deliveries_subscriberId_createdAt_idx" ON "bot_message_deliveries"("subscriberId", "createdAt");
CREATE INDEX "bot_message_deliveries_scenarioId_scenarioVersionId_idx" ON "bot_message_deliveries"("scenarioId", "scenarioVersionId");

ALTER TABLE "telegram_bots" ADD CONSTRAINT "telegram_bots_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_bots" ADD CONSTRAINT "telegram_bots_defaultProjectId_fkey"
  FOREIGN KEY ("defaultProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_scenarios" ADD CONSTRAINT "bot_scenarios_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenarios" ADD CONSTRAINT "bot_scenarios_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenarios" ADD CONSTRAINT "bot_scenarios_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_scenario_versions" ADD CONSTRAINT "bot_scenario_versions_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "bot_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_versions" ADD CONSTRAINT "bot_scenario_versions_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_versions" ADD CONSTRAINT "bot_scenario_versions_sourceWorkflowRunId_fkey"
  FOREIGN KEY ("sourceWorkflowRunId") REFERENCES "ai_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_versions" ADD CONSTRAINT "bot_scenario_versions_sourceArtifactId_fkey"
  FOREIGN KEY ("sourceArtifactId") REFERENCES "ai_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_scenarios" ADD CONSTRAINT "bot_scenarios_draftVersionId_fkey"
  FOREIGN KEY ("draftVersionId") REFERENCES "bot_scenario_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bot_scenarios" ADD CONSTRAINT "bot_scenarios_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId") REFERENCES "bot_scenario_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_subscribers" ADD CONSTRAINT "bot_subscribers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_subscribers" ADD CONSTRAINT "bot_subscribers_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_tags" ADD CONSTRAINT "bot_tags_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_tags" ADD CONSTRAINT "bot_tags_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_subscriber_tags" ADD CONSTRAINT "bot_subscriber_tags_subscriberId_fkey"
  FOREIGN KEY ("subscriberId") REFERENCES "bot_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_subscriber_tags" ADD CONSTRAINT "bot_subscriber_tags_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "bot_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_inbound_updates" ADD CONSTRAINT "bot_inbound_updates_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_inbound_updates" ADD CONSTRAINT "bot_inbound_updates_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_subscriberId_fkey"
  FOREIGN KEY ("subscriberId") REFERENCES "bot_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "bot_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_scenarioVersionId_fkey"
  FOREIGN KEY ("scenarioVersionId") REFERENCES "bot_scenario_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
