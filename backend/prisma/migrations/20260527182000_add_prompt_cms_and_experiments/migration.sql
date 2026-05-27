CREATE TABLE "prompt_versions" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "featureCode" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "model" TEXT,
  "temperature" DECIMAL(4,2),
  "maxTokens" INTEGER,
  "systemPrompt" TEXT,
  "userPromptTemplate" TEXT,
  "validationRules" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prompt_experiments" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "trafficPct" INTEGER NOT NULL DEFAULT 100,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prompt_experiments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prompt_experiment_variants" (
  "id" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "promptVersionId" TEXT,
  "name" TEXT NOT NULL,
  "trafficWeight" INTEGER NOT NULL DEFAULT 50,
  "isControl" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prompt_experiment_variants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prompt_versions_workflow_step_status_idx" ON "prompt_versions"("workflow", "step", "status");
CREATE INDEX "prompt_versions_promptId_versionLabel_idx" ON "prompt_versions"("promptId", "versionLabel");
CREATE INDEX "prompt_experiments_workflow_step_status_idx" ON "prompt_experiments"("workflow", "step", "status");
CREATE INDEX "prompt_experiment_variants_experimentId_idx" ON "prompt_experiment_variants"("experimentId");
CREATE INDEX "prompt_experiment_variants_promptVersionId_idx" ON "prompt_experiment_variants"("promptVersionId");

ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompt_experiments" ADD CONSTRAINT "prompt_experiments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompt_experiment_variants" ADD CONSTRAINT "prompt_experiment_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "prompt_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prompt_experiment_variants" ADD CONSTRAINT "prompt_experiment_variants_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
