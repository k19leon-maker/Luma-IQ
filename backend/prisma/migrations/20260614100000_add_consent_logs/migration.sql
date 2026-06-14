CREATE TABLE "consent_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
    "personalDataAccepted" BOOLEAN NOT NULL DEFAULT false,
    "offerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "documentVersion" TEXT NOT NULL,
    "source" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_logs_userId_acceptedAt_idx" ON "consent_logs"("userId", "acceptedAt");
CREATE INDEX "consent_logs_email_acceptedAt_idx" ON "consent_logs"("email", "acceptedAt");
CREATE INDEX "consent_logs_documentVersion_idx" ON "consent_logs"("documentVersion");

ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
