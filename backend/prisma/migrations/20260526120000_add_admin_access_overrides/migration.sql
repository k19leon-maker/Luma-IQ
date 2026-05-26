ALTER TABLE "subscriptions"
  ADD COLUMN "paymentSource" TEXT,
  ADD COLUMN "lastPaymentAt" TIMESTAMP(3),
  ADD COLUMN "adminNote" TEXT,
  ADD COLUMN "ltvRub" DECIMAL(12, 2),
  ADD COLUMN "limitOverrides" JSONB;
