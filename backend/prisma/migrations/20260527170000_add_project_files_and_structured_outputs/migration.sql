CREATE TABLE "project_structured_outputs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "artifactId" TEXT,
  "domain" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT,
  "title" TEXT,
  "content" TEXT,
  "data" JSONB NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ai_artifact',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_structured_outputs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_files" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER NOT NULL,
  "extension" TEXT,
  "textContent" TEXT NOT NULL,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_structured_outputs_userId_createdAt_idx" ON "project_structured_outputs"("userId", "createdAt");
CREATE INDEX "project_structured_outputs_projectId_domain_kind_idx" ON "project_structured_outputs"("projectId", "domain", "kind");
CREATE INDEX "project_structured_outputs_artifactId_idx" ON "project_structured_outputs"("artifactId");
CREATE INDEX "project_files_userId_createdAt_idx" ON "project_files"("userId", "createdAt");
CREATE INDEX "project_files_projectId_createdAt_idx" ON "project_files"("projectId", "createdAt");

ALTER TABLE "project_structured_outputs" ADD CONSTRAINT "project_structured_outputs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_structured_outputs" ADD CONSTRAINT "project_structured_outputs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_structured_outputs" ADD CONSTRAINT "project_structured_outputs_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ai_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
