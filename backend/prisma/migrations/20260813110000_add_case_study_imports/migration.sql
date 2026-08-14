CREATE TABLE "case_study_imports" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "fileName" TEXT,
  "sourceText" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_study_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_study_imports_userId_projectId_expiresAt_idx"
  ON "case_study_imports"("userId", "projectId", "expiresAt");

ALTER TABLE "case_study_imports"
  ADD CONSTRAINT "case_study_imports_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_study_imports"
  ADD CONSTRAINT "case_study_imports_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
