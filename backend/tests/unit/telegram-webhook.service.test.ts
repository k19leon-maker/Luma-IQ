import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramBot: { findFirst: mocks.findFirst },
    botInboundUpdate: { create: mocks.create },
  },
}));

import {
  TelegramWebhookAuthError,
  telegramWebhookService,
} from '../../src/services/telegram-webhook.service';

const secret = 'per-bot-webhook-secret';
const bot = {
  id: 'bot-a',
  userId: 'user-a',
  webhookSecretHash: createHash('sha256').update(secret).digest('hex'),
};

describe('telegramWebhookService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authenticates a per-bot secret and queues an owner-scoped update', async () => {
    mocks.findFirst.mockResolvedValue(bot);
    mocks.create.mockResolvedValue({ id: 'update-1' });

    const result = await telegramWebhookService.ingest({
      publicBotKey: 'public_bot_key_1234567890',
      receivedSecret: secret,
      update: { update_id: 501, message: { text: '/start' } },
    });

    expect(result).toEqual({ queued: true, duplicate: false });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        publicBotKey: 'public_bot_key_1234567890',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, userId: true, webhookSecretHash: true },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        telegramUpdateId: '501',
        kind: 'message',
        status: 'PENDING',
      }),
    });
  });

  it('uses the same response for an unknown bot and a wrong secret', async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(bot);

    await expect(telegramWebhookService.ingest({
      publicBotKey: 'unknown_public_bot_key_12345',
      receivedSecret: secret,
      update: { update_id: 1 },
    })).rejects.toBeInstanceOf(TelegramWebhookAuthError);

    await expect(telegramWebhookService.ingest({
      publicBotKey: 'public_bot_key_1234567890',
      receivedSecret: 'wrong-secret',
      update: { update_id: 2 },
    })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_TELEGRAM_WEBHOOK_AUTH',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate Telegram update ids without queueing twice', async () => {
    mocks.findFirst.mockResolvedValue(bot);
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '7.8.0',
    }));

    const result = await telegramWebhookService.ingest({
      publicBotKey: 'public_bot_key_1234567890',
      receivedSecret: secret,
      update: { update_id: 501, callback_query: { id: 'callback-1' } },
    });

    expect(result).toEqual({ queued: false, duplicate: true });
  });
});
