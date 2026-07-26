ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'CREDIT';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'CAPTURE';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'RELEASE';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'ADMIN_ADJUSTMENT';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'PLAN_ACCRUAL';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'PURCHASE';
ALTER TYPE "CreditLedgerType" ADD VALUE IF NOT EXISTS 'EXPIRATION';

CREATE TYPE "CreditLedgerUnit" AS ENUM ('LEGACY_CREDIT', 'AI_POINT');

ALTER TABLE "ai_generations"
  ADD COLUMN "aiPointsReserved" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiPointsCaptured" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiPointsRefunded" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "credit_ledger"
  ADD COLUMN "generationId" TEXT,
  ADD COLUMN "unit" "CreditLedgerUnit" NOT NULL DEFAULT 'LEGACY_CREDIT',
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balanceBefore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reservedAfter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAfter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "actionKey" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "credit_ledger"
SET
  "balanceBefore" = "balanceAfter" - "amount",
  "availableAfter" = "balanceAfter",
  "quantity" = ABS("amount");

ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_generationId_fkey"
  FOREIGN KEY ("generationId") REFERENCES "ai_generations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "credit_ledger_userId_billingPeriodId_unit_createdAt_idx"
  ON "credit_ledger"("userId", "billingPeriodId", "unit", "createdAt");
CREATE INDEX "credit_ledger_generationId_idx" ON "credit_ledger"("generationId");
CREATE INDEX "credit_ledger_expiresAt_idx" ON "credit_ledger"("expiresAt");
CREATE UNIQUE INDEX "credit_ledger_unit_generationId_type_key"
  ON "credit_ledger"("unit", "generationId", "type");
CREATE UNIQUE INDEX "credit_ledger_userId_unit_idempotencyKey_type_key"
  ON "credit_ledger"("userId", "unit", "idempotencyKey", "type");
