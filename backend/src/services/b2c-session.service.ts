import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const COOKIE_NAME = 'semeyno_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

function setSessionCookie(res: Response, token: string) {
  const production = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/api/v1/b2c',
    maxAge: SESSION_TTL_MS,
  });
}

export async function ensureB2CSession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string' && token.length >= 32) {
    const existing = await prisma.b2CSession.findFirst({
      where: {
        tokenHash: hashToken(token),
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      await prisma.b2CSession.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), expiresAt: sessionExpiry() },
      });
      setSessionCookie(res, token);
      return existing;
    }
  }

  const nextToken = randomBytes(32).toString('base64url');
  const session = await prisma.b2CSession.create({
    data: {
      tokenHash: hashToken(nextToken),
      expiresAt: sessionExpiry(),
    },
  });
  setSessionCookie(res, nextToken);
  return session;
}

export async function replaceB2CMessages(
  sessionId: string,
  messages: Array<{ role: 'psychologist' | 'client'; text: string }>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.b2CChatMessage.deleteMany({ where: { sessionId } });
    if (messages.length) {
      await tx.b2CChatMessage.createMany({
        data: messages.slice(-50).map((message) => ({
          sessionId,
          role: message.role,
          text: message.text,
        })),
      });
    }
  });
}

export async function clearB2CSession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') {
    await prisma.b2CSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/b2c',
  });
}
