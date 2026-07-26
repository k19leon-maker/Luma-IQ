CREATE TABLE "ai_context_summaries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "contextVersion" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "approxTokens" INTEGER NOT NULL DEFAULT 0,
  "sourceTokens" INTEGER NOT NULL DEFAULT 0,
  "compressed" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_context_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_context_summaries_userId_projectId_scope_sourceHash_key"
  ON "ai_context_summaries"("userId", "projectId", "scope", "sourceHash");

CREATE INDEX "ai_context_summaries_projectId_scope_version_idx"
  ON "ai_context_summaries"("projectId", "scope", "version");

CREATE INDEX "ai_context_summaries_cacheKey_idx"
  ON "ai_context_summaries"("cacheKey");

ALTER TABLE "ai_context_summaries"
  ADD CONSTRAINT "ai_context_summaries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_context_summaries"
  ADD CONSTRAINT "ai_context_summaries_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
