ALTER TABLE "bot_message_deliveries"
  ADD COLUMN "rateLimitReservedAt" TIMESTAMP(3);

CREATE TABLE "telegram_rate_limit_buckets" (
  "scopeKey" TEXT NOT NULL,
  "nextAvailableAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_rate_limit_buckets_pkey" PRIMARY KEY ("scopeKey")
);

CREATE INDEX "telegram_rate_limit_buckets_nextAvailableAt_idx"
  ON "telegram_rate_limit_buckets"("nextAvailableAt");
