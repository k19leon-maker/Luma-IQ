ALTER TABLE "case_studies"
ADD COLUMN "importBatchKey" TEXT,
ADD COLUMN "importPosition" INTEGER;

CREATE UNIQUE INDEX "case_studies_projectId_userId_importBatchKey_importPosition_key"
ON "case_studies"("projectId", "userId", "importBatchKey", "importPosition");
