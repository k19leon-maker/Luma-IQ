CREATE TYPE "BotAssetMediaType" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO', 'AUDIO');

CREATE TABLE "bot_assets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mediaType" "BotAssetMediaType" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bot_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_assets_userId_projectId_createdAt_idx"
  ON "bot_assets"("userId", "projectId", "createdAt");
CREATE INDEX "bot_assets_userId_deletedAt_idx"
  ON "bot_assets"("userId", "deletedAt");
CREATE INDEX "bot_assets_sha256_idx" ON "bot_assets"("sha256");

ALTER TABLE "bot_assets"
  ADD CONSTRAINT "bot_assets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_assets"
  ADD CONSTRAINT "bot_assets_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
