CREATE TABLE "bot_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "subscriberId" TEXT,
  "enrollmentId" TEXT,
  "scenarioId" TEXT,
  "eventType" TEXT NOT NULL,
  "nodeId" TEXT,
  "sourceId" TEXT,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_events_botId_idempotencyKey_key"
  ON "bot_events"("botId", "idempotencyKey");
CREATE INDEX "bot_events_userId_eventType_createdAt_idx"
  ON "bot_events"("userId", "eventType", "createdAt");
CREATE INDEX "bot_events_botId_eventType_createdAt_idx"
  ON "bot_events"("botId", "eventType", "createdAt");
CREATE INDEX "bot_events_subscriberId_createdAt_idx"
  ON "bot_events"("subscriberId", "createdAt");
CREATE INDEX "bot_events_enrollmentId_createdAt_idx"
  ON "bot_events"("enrollmentId", "createdAt");
CREATE INDEX "bot_events_scenarioId_createdAt_idx"
  ON "bot_events"("scenarioId", "createdAt");

ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_subscriberId_fkey"
  FOREIGN KEY ("subscriberId") REFERENCES "bot_subscribers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "bot_scenario_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "bot_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
