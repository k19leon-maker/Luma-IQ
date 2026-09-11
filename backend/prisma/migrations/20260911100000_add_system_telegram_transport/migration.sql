CREATE TYPE "SystemTelegramUpdateStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD');

CREATE TABLE "system_telegram_updates" (
  "id" TEXT NOT NULL,
  "telegramAccountId" TEXT,
  "telegramUpdateId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "SystemTelegramUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "outcome" TEXT,
  "lastErrorCode" TEXT,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_telegram_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_telegram_updates_telegramUpdateId_key"
  ON "system_telegram_updates"("telegramUpdateId");
CREATE INDEX "system_telegram_updates_status_nextAttemptAt_receivedAt_idx"
  ON "system_telegram_updates"("status", "nextAttemptAt", "receivedAt");
CREATE INDEX "system_telegram_updates_telegramAccountId_receivedAt_idx"
  ON "system_telegram_updates"("telegramAccountId", "receivedAt");

ALTER TABLE "system_telegram_updates"
  ADD CONSTRAINT "system_telegram_updates_telegramAccountId_fkey"
  FOREIGN KEY ("telegramAccountId") REFERENCES "telegram_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
