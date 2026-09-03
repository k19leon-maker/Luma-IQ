CREATE TYPE "BotScenarioEnrollmentStatus" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'STOPPED', 'FAILED');

ALTER TABLE "bot_subscribers"
  ADD COLUMN "telegramChatId" TEXT;

ALTER TABLE "bot_inbound_updates"
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3);

CREATE TABLE "bot_scenario_enrollments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "subscriberId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "scenarioVersionId" TEXT NOT NULL,
  "triggerUpdateId" TEXT NOT NULL,
  "entrypointId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "startParameter" TEXT,
  "currentNodeId" TEXT,
  "status" "BotScenarioEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "state" JSONB,
  "nextActionAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_scenario_enrollments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bot_message_deliveries"
  ADD COLUMN "enrollmentId" TEXT;

CREATE UNIQUE INDEX "bot_scenario_enrollments_botId_scenarioId_triggerUpdateId_key"
  ON "bot_scenario_enrollments"("botId", "scenarioId", "triggerUpdateId");
CREATE INDEX "bot_scenario_enrollments_userId_botId_status_nextActionAt_idx"
  ON "bot_scenario_enrollments"("userId", "botId", "status", "nextActionAt");
CREATE INDEX "bot_scenario_enrollments_subscriberId_status_startedAt_idx"
  ON "bot_scenario_enrollments"("subscriberId", "status", "startedAt");
CREATE INDEX "bot_scenario_enrollments_scenarioId_scenarioVersionId_status_idx"
  ON "bot_scenario_enrollments"("scenarioId", "scenarioVersionId", "status");
CREATE INDEX "bot_message_deliveries_enrollmentId_status_scheduledAt_idx"
  ON "bot_message_deliveries"("enrollmentId", "status", "scheduledAt");

ALTER TABLE "bot_scenario_enrollments" ADD CONSTRAINT "bot_scenario_enrollments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_enrollments" ADD CONSTRAINT "bot_scenario_enrollments_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_enrollments" ADD CONSTRAINT "bot_scenario_enrollments_subscriberId_fkey"
  FOREIGN KEY ("subscriberId") REFERENCES "bot_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_enrollments" ADD CONSTRAINT "bot_scenario_enrollments_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "bot_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_scenario_enrollments" ADD CONSTRAINT "bot_scenario_enrollments_scenarioVersionId_fkey"
  FOREIGN KEY ("scenarioVersionId") REFERENCES "bot_scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bot_message_deliveries" ADD CONSTRAINT "bot_message_deliveries_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "bot_scenario_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
