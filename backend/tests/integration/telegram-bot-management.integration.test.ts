import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  rotateToken: vi.fn(),
  diagnostics: vi.fn(),
  connectWebhook: vi.fn(),
  disconnectWebhook: vi.fn(),
  archive: vi.fn(),
  ingest: vi.fn(),
}));

vi.mock('../../src/services/telegram-bot-management.service', () => {
  class TelegramBotManagementError extends Error {
    status: number;
    code: string;
    details?: Record<string, unknown>;

    constructor(message: string, options: { status: number; code: string; details?: Record<string, unknown> }) {
      super(message);
      this.status = options.status;
      this.code = options.code;
      this.details = options.details;
    }
  }
  return {
    TelegramBotManagementError,
    telegramBotManagementService: {
      list: mocks.list,
      create: mocks.create,
      get: mocks.get,
      update: mocks.update,
      rotateToken: mocks.rotateToken,
      diagnostics: mocks.diagnostics,
      connectWebhook: mocks.connectWebhook,
      disconnectWebhook: mocks.disconnectWebhook,
      archive: mocks.archive,
    },
  };
});

vi.mock('../../src/services/telegram-webhook.service', () => ({
  TelegramWebhookAuthError: class TelegramWebhookAuthError extends Error {
    status = 401;
    code = 'INVALID_TELEGRAM_WEBHOOK_AUTH';
  },
  telegramWebhookService: { ingest: mocks.ingest },
}));

import { createApp } from '../../src/app';
import { TelegramBotManagementError } from '../../src/services/telegram-bot-management.service';

const botId = '11111111-1111-4111-8111-111111111111';
const token = '123456789:abcdefghijklmnopqrstuvwxyz_ABCDE12345';

function authHeader(userId: string): string {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('Telegram bot management API isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication for the bot collection', async () => {
    await request(createApp()).get('/api/v1/telegram-bots').expect(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('passes only the authenticated user id into list and create operations', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ bot: { id: botId }, diagnostics: {} });

    await request(createApp())
      .get('/api/v1/telegram-bots')
      .set('Authorization', authHeader('user-a'))
      .expect(200, { bots: [] });

    await request(createApp())
      .post('/api/v1/telegram-bots')
      .set('Authorization', authHeader('user-a'))
      .send({ token })
      .expect(201);

    expect(mocks.list).toHaveBeenCalledWith('user-a');
    expect(mocks.create).toHaveBeenCalledWith('user-a', { token });
  });

  it('rejects a client-supplied owner field', async () => {
    await request(createApp())
      .post('/api/v1/telegram-bots')
      .set('Authorization', authHeader('user-a'))
      .send({ token, userId: 'user-b' })
      .expect(400);

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not reveal a guessed bot id owned by another user', async () => {
    mocks.get.mockRejectedValue(new TelegramBotManagementError('Бот не найден', {
      status: 404,
      code: 'TELEGRAM_BOT_NOT_FOUND',
    }));

    const response = await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}`)
      .set('Authorization', authHeader('user-b'))
      .expect(404);

    expect(response.body).toMatchObject({ error: 'TELEGRAM_BOT_NOT_FOUND' });
    expect(mocks.get).toHaveBeenCalledWith('user-b', botId);
  });

  it('requires explicit confirmation before replacing another webhook', async () => {
    mocks.connectWebhook.mockRejectedValue(new TelegramBotManagementError(
      'Требуется подтверждение замены',
      {
        status: 409,
        code: 'TELEGRAM_WEBHOOK_CONFLICT',
        details: { existingHost: 'example.bothelp.io' },
      },
    ));

    const response = await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/webhook`)
      .set('Authorization', authHeader('user-a'))
      .send({ replaceExistingWebhook: false, dropPendingUpdates: false })
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'TELEGRAM_WEBHOOK_CONFLICT',
      details: { existingHost: 'example.bothelp.io' },
    });
  });

  it('accepts a per-bot public webhook without Luma user authentication', async () => {
    mocks.ingest.mockResolvedValue({ queued: true, duplicate: false });

    await request(createApp())
      .post('/api/v1/telegram-bots/webhooks/public_bot_key_1234567890')
      .set('x-telegram-bot-api-secret-token', 'telegram-secret')
      .send({ update_id: 700, message: { text: '/start' } })
      .expect(200, { ok: true, queued: true, duplicate: false });

    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({
      publicBotKey: 'public_bot_key_1234567890',
      receivedSecret: 'telegram-secret',
      update: expect.objectContaining({ update_id: 700 }),
    }));
  });
});
