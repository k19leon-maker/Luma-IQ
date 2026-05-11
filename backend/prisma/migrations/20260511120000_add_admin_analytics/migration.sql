-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('YOOKASSA', 'TRIBUTE', 'MANUAL', 'PROMO');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'YOOKASSA';
ALTER TABLE "payments" ADD COLUMN "externalId" TEXT;
ALTER TABLE "payments" ADD COLUMN "adminNote" TEXT;

-- CreateTable
CREATE TABLE "user_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "section" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_events_userId_createdAt_idx" ON "user_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_events_type_createdAt_idx" ON "user_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_userId_createdAt_idx" ON "ai_request_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_provider_createdAt_idx" ON "ai_request_logs"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_status_createdAt_idx" ON "ai_request_logs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
