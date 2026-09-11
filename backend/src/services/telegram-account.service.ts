import { createHash, randomBytes } from 'crypto';
import { Prisma, TelegramAccountStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { eventService } from './event.service';

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

const publicAccountSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  languageCode: true,
  status: true,
  linkedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramAccountSelect;

export interface TelegramIdentityInput {
  telegramUserId: string;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
}

export class TelegramAccountError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramAccountError';
  }
}

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function trackRejectedLink(userId: string, reason: string): Promise<void> {
  await eventService.track('telegram_identity_link_rejected', {
    userId,
    actorId: userId,
    metadata: { reason },
  }).catch(() => {});
}

async function requireActiveUser(userId: string, requireVerified = false): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isVerified: true, archivedAt: true },
  });
  if (!user || user.archivedAt) {
    throw new TelegramAccountError(403, 'TELEGRAM_LINK_NOT_ALLOWED', 'Операция с Telegram недоступна');
  }
  if (requireVerified && !user.isVerified) {
    throw new TelegramAccountError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Сначала подтвердите email');
  }
}

export async function revokeTelegramAccountsInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  actorId: string,
  reason: 'user_archived' | 'account_deleted',
): Promise<number> {
  const now = new Date();
  const result = await tx.telegramAccount.updateMany({
    where: { userId, status: TelegramAccountStatus.LINKED },
    data: {
      status: TelegramAccountStatus.REVOKED,
      revokedAt: now,
      linkTokenHash: null,
      linkTokenExpiresAt: null,
      linkTokenConsumedAt: null,
    },
  });

  await tx.telegramLoginToken.updateMany({
    where: {
      telegramAccount: { is: { userId } },
      consumedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });

  if (result.count > 0) {
    await tx.userEvent.create({
      data: {
        userId,
        actorId,
        type: 'telegram_identity_revoked',
        metadata: { reason, count: result.count } as Prisma.InputJsonValue,
      },
    });
  }

  return result.count;
}

export const telegramAccountService = {
  /** Called by the isolated system-bot transport. Never expose the token in logs or persistence. */
  async beginLinkFlow(identity: TelegramIdentityInput): Promise<
    | { state: 'LINKED'; accountId: string }
    | { state: 'PENDING'; accountId: string; token: string; expiresAt: Date }
  > {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashLinkToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.telegramAccount.findUnique({
        where: { telegramUserId: identity.telegramUserId },
      });

      if (existing?.status === TelegramAccountStatus.BLOCKED) {
        throw new TelegramAccountError(403, 'TELEGRAM_ACCOUNT_BLOCKED', 'Связь с Telegram заблокирована');
      }

      if (existing?.status === TelegramAccountStatus.LINKED && existing.userId) {
        await tx.telegramAccount.update({
          where: { id: existing.id },
          data: {
            telegramChatId: identity.telegramChatId,
            username: identity.username ?? null,
            firstName: identity.firstName ?? null,
            lastName: identity.lastName ?? null,
            languageCode: identity.languageCode ?? null,
            lastSeenAt: now,
          },
        });
        return { state: 'LINKED' as const, accountId: existing.id };
      }

      const account = existing
        ? await tx.telegramAccount.update({
            where: { id: existing.id },
            data: {
              telegramChatId: identity.telegramChatId,
              username: identity.username ?? null,
              firstName: identity.firstName ?? null,
              lastName: identity.lastName ?? null,
              languageCode: identity.languageCode ?? null,
              status: TelegramAccountStatus.PENDING,
              linkTokenHash: tokenHash,
              linkTokenExpiresAt: expiresAt,
              linkTokenConsumedAt: null,
              lastSeenAt: now,
              blockedAt: null,
            },
          })
        : await tx.telegramAccount.create({
            data: {
              telegramUserId: identity.telegramUserId,
              telegramChatId: identity.telegramChatId,
              username: identity.username ?? null,
              firstName: identity.firstName ?? null,
              lastName: identity.lastName ?? null,
              languageCode: identity.languageCode ?? null,
              linkTokenHash: tokenHash,
              linkTokenExpiresAt: expiresAt,
            },
          });

      await tx.userEvent.create({
        data: {
          userId: null,
          actorId: null,
          type: 'telegram_identity_link_requested',
          metadata: { telegramAccountId: account.id } as Prisma.InputJsonValue,
        },
      });

      return { state: 'PENDING' as const, accountId: account.id, token, expiresAt };
    });
  },

  async getForUser(userId: string) {
    await requireActiveUser(userId);
    return prisma.telegramAccount.findFirst({
      where: { userId },
      orderBy: [{ linkedAt: 'desc' }, { updatedAt: 'desc' }],
      select: publicAccountSelect,
    });
  },

  async linkAuthenticatedUser(userId: string, token: string) {
    try {
      await requireActiveUser(userId, true);
    } catch (error) {
      const reason = error instanceof TelegramAccountError ? error.code : 'inactive_user';
      await trackRejectedLink(userId, reason);
      throw error;
    }

    const now = new Date();
    const tokenHash = hashLinkToken(token);
    try {
      return await prisma.$transaction(async (tx) => {
        const account = await tx.telegramAccount.findFirst({
          where: {
            linkTokenHash: tokenHash,
            linkTokenConsumedAt: null,
            linkTokenExpiresAt: { gt: now },
            status: { in: [TelegramAccountStatus.PENDING, TelegramAccountStatus.REVOKED] },
          },
        });
        if (!account) {
          throw new TelegramAccountError(400, 'INVALID_TELEGRAM_LINK_TOKEN', 'Код привязки недействителен или истёк');
        }

        const existingLink = await tx.telegramAccount.findFirst({
          where: {
            userId,
            status: TelegramAccountStatus.LINKED,
            id: { not: account.id },
          },
          select: { id: true },
        });
        if (existingLink) {
          throw new TelegramAccountError(409, 'TELEGRAM_ACCOUNT_ALREADY_LINKED', 'К аккаунту уже привязан Telegram');
        }

        const previousUserId = account.userId;
        const wasLinkedBefore = Boolean(account.linkedAt || account.revokedAt);
        const update = await tx.telegramAccount.updateMany({
          where: {
            id: account.id,
            linkTokenHash: tokenHash,
            linkTokenConsumedAt: null,
            linkTokenExpiresAt: { gt: now },
            status: { in: [TelegramAccountStatus.PENDING, TelegramAccountStatus.REVOKED] },
          },
          data: {
            userId,
            status: TelegramAccountStatus.LINKED,
            linkedAt: now,
            revokedAt: null,
            linkTokenHash: null,
            linkTokenExpiresAt: null,
            linkTokenConsumedAt: now,
          },
        });
        if (update.count !== 1) {
          throw new TelegramAccountError(409, 'TELEGRAM_LINK_ALREADY_CONSUMED', 'Код привязки уже использован');
        }

        await tx.telegramLoginToken.updateMany({
          where: {
            telegramAccountId: account.id,
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        await tx.userEvent.create({
          data: {
            userId,
            actorId: userId,
            type: wasLinkedBefore ? 'telegram_identity_relinked' : 'telegram_identity_linked',
            metadata: {
              telegramAccountId: account.id,
              previousOwnerChanged: Boolean(previousUserId && previousUserId !== userId),
            } as Prisma.InputJsonValue,
          },
        });

        return tx.telegramAccount.findUniqueOrThrow({
          where: { id: account.id },
          select: publicAccountSelect,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await trackRejectedLink(userId, 'TELEGRAM_ACCOUNT_ALREADY_LINKED');
        throw new TelegramAccountError(409, 'TELEGRAM_ACCOUNT_ALREADY_LINKED', 'К аккаунту уже привязан Telegram');
      }
      const reason = error instanceof TelegramAccountError ? error.code : 'link_failed';
      await trackRejectedLink(userId, reason);
      throw error;
    }
  },

  async revokeForUser(userId: string) {
    await requireActiveUser(userId);
    return prisma.$transaction(async (tx) => {
      const account = await tx.telegramAccount.findFirst({
        where: { userId, status: TelegramAccountStatus.LINKED },
        select: { id: true },
      });
      if (!account) {
        throw new TelegramAccountError(404, 'TELEGRAM_ACCOUNT_NOT_FOUND', 'Привязанный Telegram не найден');
      }

      const now = new Date();
      const update = await tx.telegramAccount.updateMany({
        where: { id: account.id, userId, status: TelegramAccountStatus.LINKED },
        data: {
          status: TelegramAccountStatus.REVOKED,
          revokedAt: now,
          linkTokenHash: null,
          linkTokenExpiresAt: null,
          linkTokenConsumedAt: null,
        },
      });
      if (update.count !== 1) {
        throw new TelegramAccountError(409, 'TELEGRAM_ACCOUNT_CHANGED', 'Связь Telegram уже изменена');
      }

      await tx.telegramLoginToken.updateMany({
        where: {
          telegramAccountId: account.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      await tx.userEvent.create({
        data: {
          userId,
          actorId: userId,
          type: 'telegram_identity_revoked',
          metadata: { telegramAccountId: account.id, reason: 'user_requested' } as Prisma.InputJsonValue,
        },
      });

      return { ok: true };
    });
  },

  async resolveLinkedUser(telegramUserId: string) {
    const account = await prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: {
        id: true,
        status: true,
        user: { select: { id: true, archivedAt: true, isVerified: true } },
      },
    });
    if (
      !account
      || account.status !== TelegramAccountStatus.LINKED
      || !account.user
      || account.user.archivedAt
      || !account.user.isVerified
    ) {
      return null;
    }
    return { telegramAccountId: account.id, userId: account.user.id };
  },

  async markBlocked(telegramUserId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const account = await tx.telegramAccount.findUnique({
        where: { telegramUserId },
        select: { id: true, userId: true, status: true },
      });
      if (!account || account.status === TelegramAccountStatus.BLOCKED) return;

      const now = new Date();
      await tx.telegramAccount.update({
        where: { id: account.id },
        data: {
          status: TelegramAccountStatus.BLOCKED,
          blockedAt: now,
          linkTokenHash: null,
          linkTokenExpiresAt: null,
          linkTokenConsumedAt: null,
        },
      });
      await tx.telegramLoginToken.updateMany({
        where: {
          telegramAccountId: account.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await tx.userEvent.create({
        data: {
          userId: account.userId,
          actorId: null,
          type: 'telegram_identity_blocked',
          metadata: { telegramAccountId: account.id } as Prisma.InputJsonValue,
        },
      });
    });
  },
};
