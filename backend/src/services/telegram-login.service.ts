import { createHash, randomBytes } from 'crypto';
import { Prisma, ProjectStatus, TelegramAccountStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authService, toAuthUser } from './auth.service';

const TELEGRAM_LOGIN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TELEGRAM_REDIRECT = '/app/ai-dialog';

const exactAppPaths = new Set([
  '/app',
  '/app/dashboard',
  '/app/ai-dialog',
  '/app/tasks',
  '/app/content-plan',
  '/app/strategy/about',
  '/app/strategy/positioning',
  '/app/strategy/audience',
  '/app/strategy/castdev',
  '/app/strategy/cases',
  '/app/strategy/utp',
  '/app/strategy/social',
  '/app/products/main',
  '/app/products/mini',
  '/app/products/lead-magnet',
  '/app/posts',
  '/app/reels',
  '/app/articles',
  '/app/video-scripts',
  '/app/chatbots',
  '/app/chatbot-scenarios',
  '/app/chatbot-audience',
  '/app/chatbot-chains',
  '/app/threads',
  '/app/tg-channel',
  '/app/files/materials',
  '/app/files/products',
  '/app/analytics',
  '/app/education',
  '/app/history',
  '/app/settings',
  '/app/limits',
  '/app/pricing',
]);

const dynamicAppPaths = [
  /^\/app\/strategy\/cases\/[a-zA-Z0-9-]+$/,
  /^\/app\/projects\/[a-zA-Z0-9-]+$/,
];

export class TelegramLoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramLoginError';
  }
}

function hashLoginToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sanitizeTelegramRedirect(value?: string | null): string {
  if (!value) return DEFAULT_TELEGRAM_REDIRECT;
  const hasControlCharacter = Array.from(value).some((character) => character.charCodeAt(0) < 32);
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || hasControlCharacter) {
    return DEFAULT_TELEGRAM_REDIRECT;
  }

  try {
    const base = 'https://lumaiq.local';
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return DEFAULT_TELEGRAM_REDIRECT;
    const allowed = exactAppPaths.has(parsed.pathname)
      || dynamicAppPaths.some((pattern) => pattern.test(parsed.pathname));
    return allowed
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : DEFAULT_TELEGRAM_REDIRECT;
  } catch {
    return DEFAULT_TELEGRAM_REDIRECT;
  }
}

function invalidLogin(): TelegramLoginError {
  return new TelegramLoginError(
    401,
    'INVALID_TELEGRAM_LOGIN_TOKEN',
    'Ссылка недействительна, истекла или уже использована',
  );
}

export const telegramLoginService = {
  /** Called only by the isolated system-bot transport. Never log or persist the returned plaintext token. */
  async issueBrowserLogin(input: {
    telegramAccountId: string;
    intendedProjectId?: string | null;
    intendedPath?: string | null;
  }) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashLoginToken(token);
    const intendedPath = sanitizeTelegramRedirect(input.intendedPath);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TELEGRAM_LOGIN_TTL_MS);

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.telegramAccount.findUnique({
        where: { id: input.telegramAccountId },
        select: {
          id: true,
          userId: true,
          status: true,
          user: { select: { archivedAt: true, isVerified: true } },
        },
      });
      if (
        !account
        || account.status !== TelegramAccountStatus.LINKED
        || !account.userId
        || !account.user
        || account.user.archivedAt
        || !account.user.isVerified
      ) {
        throw new TelegramLoginError(403, 'TELEGRAM_LOGIN_NOT_ALLOWED', 'Вход через Telegram недоступен');
      }

      if (input.intendedProjectId) {
        const project = await tx.project.findFirst({
          where: {
            id: input.intendedProjectId,
            userId: account.userId,
            status: { not: ProjectStatus.ARCHIVED },
          },
          select: { id: true },
        });
        if (!project) {
          throw new TelegramLoginError(403, 'TELEGRAM_PROJECT_NOT_ALLOWED', 'Проект недоступен');
        }
      }

      await tx.telegramLoginToken.updateMany({
        where: {
          telegramAccountId: account.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      const loginToken = await tx.telegramLoginToken.create({
        data: {
          telegramAccountId: account.id,
          tokenHash,
          intendedProjectId: input.intendedProjectId ?? null,
          intendedPath,
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      });

      await tx.userEvent.create({
        data: {
          userId: account.userId,
          actorId: account.userId,
          type: 'telegram_browser_login_requested',
          metadata: {
            telegramAccountId: account.id,
            loginTokenId: loginToken.id,
            intendedProjectId: input.intendedProjectId ?? null,
            intendedPath,
          } as Prisma.InputJsonValue,
        },
      });

      return loginToken;
    });

    return { token, expiresAt: result.expiresAt };
  },

  async consumeBrowserLogin(token: string) {
    const tokenHash = hashLoginToken(token);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loginToken = await tx.telegramLoginToken.findUnique({
        where: { tokenHash },
        include: {
          telegramAccount: {
            include: { user: true },
          },
        },
      });

      const account = loginToken?.telegramAccount;
      const user = account?.user;
      if (
        !loginToken
        || loginToken.consumedAt
        || loginToken.revokedAt
        || loginToken.expiresAt <= now
        || !account
        || account.status !== TelegramAccountStatus.LINKED
        || !user
        || user.archivedAt
        || !user.isVerified
      ) {
        throw invalidLogin();
      }

      let intendedProjectId = loginToken.intendedProjectId;
      if (intendedProjectId) {
        const project = await tx.project.findFirst({
          where: {
            id: intendedProjectId,
            userId: user.id,
            status: { not: ProjectStatus.ARCHIVED },
          },
          select: { id: true },
        });
        if (!project) intendedProjectId = null;
      }

      const consumed = await tx.telegramLoginToken.updateMany({
        where: {
          id: loginToken.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          telegramAccount: {
            is: {
              id: account.id,
              userId: user.id,
              status: TelegramAccountStatus.LINKED,
            },
          },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidLogin();

      const tokens = await authService.issueTokensInTransaction(tx, user.id);
      const intendedPath = sanitizeTelegramRedirect(loginToken.intendedPath);

      await tx.userEvent.create({
        data: {
          userId: user.id,
          actorId: user.id,
          type: 'telegram_browser_login_consumed',
          metadata: {
            telegramAccountId: account.id,
            loginTokenId: loginToken.id,
            intendedProjectId,
            intendedPath,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        user: toAuthUser(user),
        tokens,
        redirect: { path: intendedPath, projectId: intendedProjectId },
      };
    });
  },
};
