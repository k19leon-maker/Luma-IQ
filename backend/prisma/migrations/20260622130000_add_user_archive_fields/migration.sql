ALTER TABLE "users" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "users" ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "users_archivedAt_idx" ON "users"("archivedAt");
