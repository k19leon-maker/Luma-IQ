CREATE TABLE "b2c_sessions" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "profile" JSONB,
  "diagnosticAnswers" JSONB,
  "clientData" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "b2c_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "b2c_chat_messages" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "b2c_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "b2c_sessions_tokenHash_key" ON "b2c_sessions"("tokenHash");
CREATE INDEX "b2c_sessions_expiresAt_idx" ON "b2c_sessions"("expiresAt");
CREATE INDEX "b2c_sessions_email_updatedAt_idx" ON "b2c_sessions"("email", "updatedAt");
CREATE INDEX "b2c_chat_messages_sessionId_createdAt_idx" ON "b2c_chat_messages"("sessionId", "createdAt");

ALTER TABLE "b2c_chat_messages"
  ADD CONSTRAINT "b2c_chat_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "b2c_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
