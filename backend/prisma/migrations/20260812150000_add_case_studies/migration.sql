CREATE TABLE "case_studies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "beforeText" TEXT NOT NULL,
    "actionsText" TEXT NOT NULL,
    "afterText" TEXT NOT NULL,
    "clientTask" TEXT,
    "clientProblem" TEXT,
    "desiredResult" TEXT,
    "marketingInsight" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_studies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_studies_status_check" CHECK ("status" IN ('draft', 'ready')),
    CONSTRAINT "case_studies_source_type_check" CHECK ("sourceType" IN ('manual', 'voice', 'screenshot', 'document'))
);

CREATE INDEX "case_studies_projectId_status_updatedAt_idx"
ON "case_studies"("projectId", "status", "updatedAt");

CREATE INDEX "case_studies_userId_updatedAt_idx"
ON "case_studies"("userId", "updatedAt");

ALTER TABLE "case_studies"
ADD CONSTRAINT "case_studies_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_studies"
ADD CONSTRAINT "case_studies_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
