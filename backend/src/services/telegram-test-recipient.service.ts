import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const VERIFICATION_PREFIX = 'luma_test_';
const VERIFICATION_TTL_MS = 15 * 60 * 1000;
const CREATED_EVENT = 'OWNER_TEST_VERIFICATION_CREATED';
const VERIFIED_EVENT = 'OWNER_TEST_RECIPIENT_VERIFIED';

export class TelegramTestRecipientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'TelegramTestRecipientError';
    this.status = status;
    this.code = code;
  }
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function ownedBot(userId: string, botId: string) {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: botId, userId, deletedAt: null },
    select: { id: true, username: true, status: true },
  });
  if (!bot) throw new TelegramTestRecipientError('Бот не найден', 404, 'TELEGRAM_BOT_NOT_FOUND');
  return bot;
}

async function verifiedEvent(userId: string, botId: string) {
  return prisma.botEvent.findFirst({
    where: {
      userId,
      botId,
      eventType: VERIFIED_EVENT,
      subscriberId: { not: null },
      subscriber: { userId, botId, status: 'ACTIVE', archivedAt: null },
    },
    select: {
      subscriberId: true,
      createdAt: true,
      subscriber: {
        select: {
          id: true,
          telegramUserId: true,
          telegramChatId: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export const telegramTestRecipientService = {
  isVerificationStartParameter(startParameter: string | null): boolean {
    return Boolean(startParameter?.startsWith(VERIFICATION_PREFIX));
  },

  async createVerification(userId: string, botId: string): Promise<{
    deepLink: string;
    expiresAt: Date;
  }> {
    const bot = await ownedBot(userId, botId);
    if (bot.status !== 'ACTIVE') {
      throw new TelegramTestRecipientError(
        'Сначала подключите webhook бота',
        409,
        'TELEGRAM_BOT_WEBHOOK_REQUIRED',
      );
    }

    const token = randomBytes(24).toString('base64url');
    const digest = digestToken(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    await prisma.botEvent.create({
      data: {
        userId,
        botId,
        eventType: CREATED_EVENT,
        sourceId: digest,
        idempotencyKey: `owner-test-verification:${digest}`,
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    });

    return {
      deepLink: `https://t.me/${bot.username}?start=${VERIFICATION_PREFIX}${token}`,
      expiresAt,
    };
  },

  async consumeVerification(input: {
    userId: string;
    botId: string;
    subscriberId: string;
    telegramUserId: string;
    telegramChatId: string;
    startParameter: string | null;
  }): Promise<boolean> {
    const match = input.startParameter?.match(/^luma_test_([A-Za-z0-9_-]{32})$/);
    if (!match) return false;
    if (input.telegramUserId !== input.telegramChatId) return false;

    const digest = digestToken(match[1]);
    const pending = await prisma.botEvent.findFirst({
      where: {
        userId: input.userId,
        botId: input.botId,
        eventType: CREATED_EVENT,
        sourceId: digest,
      },
      select: { id: true, metadata: true },
    });
    if (!pending) return false;
    const expiresAt = new Date(String(metadataObject(pending.metadata).expiresAt ?? ''));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) return false;

    const idempotencyKey = `owner-test-recipient:${digest}`;
    try {
      await prisma.botEvent.create({
        data: {
          userId: input.userId,
          botId: input.botId,
          subscriberId: input.subscriberId,
          eventType: VERIFIED_EVENT,
          sourceId: pending.id,
          idempotencyKey,
          metadata: { method: 'telegram_deep_link' },
        },
      });
      return true;
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await prisma.botEvent.findFirst({
        where: { userId: input.userId, botId: input.botId, idempotencyKey },
        select: { subscriberId: true },
      });
      return existing?.subscriberId === input.subscriberId;
    }
  },

  async status(userId: string, botId: string): Promise<{
    confirmed: boolean;
    confirmedAt: Date | null;
    recipient: { username: string | null; firstName: string | null; lastName: string | null } | null;
  }> {
    await ownedBot(userId, botId);
    const event = await verifiedEvent(userId, botId);
    return {
      confirmed: Boolean(event?.subscriber),
      confirmedAt: event?.createdAt ?? null,
      recipient: event?.subscriber
        ? {
          username: event.subscriber.username,
          firstName: event.subscriber.firstName,
          lastName: event.subscriber.lastName,
        }
        : null,
    };
  },

  async getVerifiedRecipient(userId: string, botId: string) {
    await ownedBot(userId, botId);
    const event = await verifiedEvent(userId, botId);
    if (!event?.subscriber || !event.subscriber.telegramChatId) {
      throw new TelegramTestRecipientError(
        'Подтвердите свой Telegram через одноразовую ссылку',
        409,
        'TELEGRAM_TEST_RECIPIENT_NOT_VERIFIED',
      );
    }
    return event.subscriber;
  },
};

export const telegramTestRecipientInternals = {
  digestToken,
  VERIFICATION_PREFIX,
};
