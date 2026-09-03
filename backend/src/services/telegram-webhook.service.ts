import { createHash, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface TelegramWebhookUpdate extends Record<string, unknown> {
  update_id: number;
}

export class TelegramWebhookAuthError extends Error {
  readonly status = 401;
  readonly code = 'INVALID_TELEGRAM_WEBHOOK_AUTH';

  constructor() {
    super('Некорректная авторизация Telegram webhook');
    this.name = 'TelegramWebhookAuthError';
  }
}

function secretMatches(received: string, expectedHash: string): boolean {
  if (!received || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const receivedHash = createHash('sha256').update(received).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === receivedHash.length && timingSafeEqual(receivedHash, expected);
}

export function telegramUpdateKind(update: TelegramWebhookUpdate): string {
  return [
    'message',
    'edited_message',
    'channel_post',
    'edited_channel_post',
    'callback_query',
    'inline_query',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ].find((key) => key in update) ?? 'unknown';
}

export const telegramWebhookService = {
  async ingest(input: {
    publicBotKey: string;
    receivedSecret: string;
    update: TelegramWebhookUpdate;
  }): Promise<{ queued: boolean; duplicate: boolean }> {
    const bot = await prisma.telegramBot.findFirst({
      where: {
        publicBotKey: input.publicBotKey,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        webhookSecretHash: true,
      },
    });

    if (!bot?.webhookSecretHash || !secretMatches(input.receivedSecret, bot.webhookSecretHash)) {
      throw new TelegramWebhookAuthError();
    }

    try {
      await prisma.botInboundUpdate.create({
        data: {
          userId: bot.userId,
          botId: bot.id,
          telegramUpdateId: String(input.update.update_id),
          kind: telegramUpdateKind(input.update),
          payload: input.update as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      return { queued: true, duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { queued: false, duplicate: true };
      }
      throw error;
    }
  },
};
