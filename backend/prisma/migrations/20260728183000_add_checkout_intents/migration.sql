CREATE TYPE "CheckoutIntentStatus" AS ENUM (
  'PENDING',
  'PAYMENT_CREATED',
  'PAID',
  'ACCOUNT_LINK_PENDING',
  'ACCOUNT_CREATED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "CheckoutPaymentAttemptStatus" AS ENUM (
  'CREATED',
  'PENDING',
  'SUCCEEDED',
  'CANCELLED',
  'FAILED',
  'UNKNOWN'
);

CREATE TABLE "checkout_intents" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sessionTokenHash" TEXT NOT NULL,
  "csrfTokenHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "CheckoutIntentStatus" NOT NULL DEFAULT 'PENDING',
  "email" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "name" TEXT,
  "planCode" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "pricingSnapshot" JSONB NOT NULL,
  "consentSnapshot" JSONB NOT NULL,
  "legalDocumentVersion" TEXT NOT NULL,
  "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
  "attribution" JSONB,
  "anonymousSessionId" TEXT,
  "landingPath" TEXT,
  "referrer" TEXT,
  "activatedUserId" TEXT,
  "paidAt" TIMESTAMP(3),
  "accountActivatedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_payment_attempts" (
  "id" TEXT NOT NULL,
  "checkoutIntentId" TEXT NOT NULL,
  "status" "CheckoutPaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "provider" TEXT NOT NULL DEFAULT 'YOOKASSA',
  "providerPaymentId" TEXT,
  "providerIdempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "confirmationUrl" TEXT,
  "errorCode" TEXT,
  "providerStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_payment_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN "checkoutIntentId" TEXT;

CREATE UNIQUE INDEX "checkout_intents_orderId_key" ON "checkout_intents"("orderId");
CREATE UNIQUE INDEX "checkout_intents_sessionTokenHash_key" ON "checkout_intents"("sessionTokenHash");
CREATE UNIQUE INDEX "checkout_intents_idempotencyKey_key" ON "checkout_intents"("idempotencyKey");
CREATE INDEX "checkout_intents_emailHash_createdAt_idx" ON "checkout_intents"("emailHash", "createdAt");
CREATE INDEX "checkout_intents_status_expiresAt_idx" ON "checkout_intents"("status", "expiresAt");
CREATE INDEX "checkout_intents_activatedUserId_idx" ON "checkout_intents"("activatedUserId");
CREATE UNIQUE INDEX "checkout_payment_attempts_providerPaymentId_key" ON "checkout_payment_attempts"("providerPaymentId");
CREATE UNIQUE INDEX "checkout_payment_attempts_providerIdempotencyKey_key" ON "checkout_payment_attempts"("providerIdempotencyKey");
CREATE INDEX "checkout_payment_attempts_checkoutIntentId_createdAt_idx" ON "checkout_payment_attempts"("checkoutIntentId", "createdAt");
CREATE INDEX "checkout_payment_attempts_status_updatedAt_idx" ON "checkout_payment_attempts"("status", "updatedAt");
CREATE UNIQUE INDEX "payments_checkoutIntentId_key" ON "payments"("checkoutIntentId");

ALTER TABLE "checkout_intents"
  ADD CONSTRAINT "checkout_intents_activatedUserId_fkey"
  FOREIGN KEY ("activatedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "checkout_payment_attempts"
  ADD CONSTRAINT "checkout_payment_attempts_checkoutIntentId_fkey"
  FOREIGN KEY ("checkoutIntentId") REFERENCES "checkout_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_checkoutIntentId_fkey"
  FOREIGN KEY ("checkoutIntentId") REFERENCES "checkout_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
