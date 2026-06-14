import { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const LEGAL_DOCUMENT_VERSION = 'v1';

export const legalConsentSchema = z.object({
  privacyAccepted: z.literal(true),
  personalDataAccepted: z.literal(true),
  offerAccepted: z.literal(true),
  documentVersion: z.string().min(1).default(LEGAL_DOCUMENT_VERSION),
});

export type LegalConsentInput = z.infer<typeof legalConsentSchema>;

function getClientIp(req: Request) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.ip ||
    null
  );
}

export async function logConsent(params: {
  req: Request;
  userId?: string | null;
  email?: string | null;
  consents: LegalConsentInput;
  source?: string;
}) {
  const { req, userId, email, consents, source } = params;

  await prisma.consentLog.create({
    data: {
      userId: userId ?? null,
      email: email?.trim().toLowerCase() || null,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
      privacyAccepted: consents.privacyAccepted,
      personalDataAccepted: consents.personalDataAccepted,
      offerAccepted: consents.offerAccepted,
      documentVersion: consents.documentVersion,
      source,
    },
  });
}

export function hasRequiredConsent(consents: unknown) {
  return legalConsentSchema.safeParse(consents).success;
}
