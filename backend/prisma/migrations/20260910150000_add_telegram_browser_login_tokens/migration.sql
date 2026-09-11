CREATE TABLE "telegram_login_tokens" (
  "id" TEXT NOT NULL,
  "telegramAccountId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "intendedProjectId" TEXT,
  "intendedPath" TEXT NOT NULL DEFAULT '/app/ai-dialog',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_login_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_login_tokens_tokenHash_key"
  ON "telegram_login_tokens"("tokenHash");
CREATE INDEX "telegram_login_tokens_telegramAccountId_createdAt_idx"
  ON "telegram_login_tokens"("telegramAccountId", "createdAt");
CREATE INDEX "telegram_login_tokens_expiresAt_idx"
  ON "telegram_login_tokens"("expiresAt");

ALTER TABLE "telegram_login_tokens"
  ADD CONSTRAINT "telegram_login_tokens_telegramAccountId_fkey"
  FOREIGN KEY ("telegramAccountId") REFERENCES "telegram_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
