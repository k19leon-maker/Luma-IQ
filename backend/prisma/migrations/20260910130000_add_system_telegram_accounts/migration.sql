CREATE TYPE "TelegramAccountStatus" AS ENUM ('PENDING', 'LINKED', 'BLOCKED', 'REVOKED');

CREATE TABLE "telegram_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "telegramUserId" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "languageCode" TEXT,
  "status" "TelegramAccountStatus" NOT NULL DEFAULT 'PENDING',
  "linkTokenHash" TEXT,
  "linkTokenExpiresAt" TIMESTAMP(3),
  "linkTokenConsumedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linkedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_accounts_telegramUserId_key"
  ON "telegram_accounts"("telegramUserId");
CREATE UNIQUE INDEX "telegram_accounts_linkTokenHash_key"
  ON "telegram_accounts"("linkTokenHash");
CREATE INDEX "telegram_accounts_userId_status_idx"
  ON "telegram_accounts"("userId", "status");
CREATE INDEX "telegram_accounts_status_lastSeenAt_idx"
  ON "telegram_accounts"("status", "lastSeenAt");
CREATE INDEX "telegram_accounts_linkTokenExpiresAt_idx"
  ON "telegram_accounts"("linkTokenExpiresAt");

-- A user can have historical revoked records, but only one active system-bot link.
CREATE UNIQUE INDEX "telegram_accounts_one_linked_per_user_idx"
  ON "telegram_accounts"("userId")
  WHERE "status" = 'LINKED' AND "userId" IS NOT NULL;

ALTER TABLE "telegram_accounts"
  ADD CONSTRAINT "telegram_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
