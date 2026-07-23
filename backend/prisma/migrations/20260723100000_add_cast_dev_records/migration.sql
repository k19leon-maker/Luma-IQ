CREATE TABLE "cast_dev_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'google_drive',
  "fileName" TEXT,
  "mimeType" TEXT,
  "durationSec" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "transcriptText" TEXT,
  "transcriptFormatted" TEXT,
  "analysis" JSONB,
  "metadata" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cast_dev_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cast_dev_records_userId_projectId_createdAt_idx" ON "cast_dev_records"("userId", "projectId", "createdAt");
CREATE INDEX "cast_dev_records_projectId_status_idx" ON "cast_dev_records"("projectId", "status");

ALTER TABLE "cast_dev_records"
ADD CONSTRAINT "cast_dev_records_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cast_dev_records"
ADD CONSTRAINT "cast_dev_records_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
