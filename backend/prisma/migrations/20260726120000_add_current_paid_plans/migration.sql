ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'SYSTEM_FUNNEL';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'EVERGREEN_FUNNEL';

CREATE TABLE IF NOT EXISTS "plan_catalog_overrides" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isPublic" BOOLEAN,
    "isPurchasable" BOOLEAN,
    "displayOrder" INTEGER,
    "shortDescription" TEXT,
    "extendedDescription" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_catalog_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_catalog_overrides_code_key"
ON "plan_catalog_overrides"("code");
