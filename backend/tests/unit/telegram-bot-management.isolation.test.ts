import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telegramBot: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  project: { findFirst: vi.fn() },
  diagnose: vi.fn(),
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramBot: mocks.telegramBot,
    project: mocks.project,
  },
}));

vi.mock('../../src/services/telegram-bot.service', () => ({
  TelegramBotApiError: class TelegramBotApiError extends Error {},
  telegramBotService: {
    diagnose: mocks.diagnose,
    setWebhook: mocks.setWebhook,
    deleteWebhook: mocks.deleteWebhook,
  },
}));

vi.mock('../../src/services/telegram-secret.service', () => ({
  TelegramSecretError: class TelegramSecretError extends Error {},
  telegramSecretService: {
    encrypt: vi.fn(() => ({ ciphertext: 'encrypted', keyVersion: 1 })),
    decrypt: vi.fn(() => '123456789:abcdefghijklmnopqrstuvwxyz_ABCDE12345'),
  },
  telegramTokenLast4: vi.fn(() => '2345'),
  safeTelegramErrorMessage: vi.fn((error: unknown) => String(error)),
}));

import {
  TelegramBotManagementError,
  telegramBotManagementService,
} from '../../src/services/telegram-bot-management.service';
import { env } from '../../src/config/env';

const storedBot = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-a',
  defaultProjectId: null,
  telegramBotId: '407920985',
  username: 'test_bot',
  displayName: 'Test Bot',
  encryptedToken: 'tg1.1.secret-envelope',
  tokenKeyVersion: 1,
  tokenLast4: '2345',
  publicBotKey: 'public-key-that-is-not-returned',
  webhookSecretHash: 'a'.repeat(64),
  status: 'ACTIVE',
  lastHealthCheckAt: null,
  lastError: null,
  webhookConnectedAt: new Date('2026-09-02T10:00:00.000Z'),
  disconnectedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-09-02T09:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
} as const;

describe('Telegram bot tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { TELEGRAM_WEBHOOK_BASE_URL: string }).TELEGRAM_WEBHOOK_BASE_URL =
      'https://api.lumaiq.ru/api/v1/telegram-bots/webhooks';
  });

  it('scopes list queries by the authenticated owner and strips secrets', async () => {
    mocks.telegramBot.findMany.mockResolvedValue([storedBot]);

    const result = await telegramBotManagementService.list('user-a');

    expect(mocks.telegramBot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', deletedAt: null },
    }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: storedBot.id, tokenHint: '••••2345' });
    expect(result[0]).not.toHaveProperty('encryptedToken');
    expect(result[0]).not.toHaveProperty('webhookSecretHash');
    expect(result[0]).not.toHaveProperty('publicBotKey');
  });

  it('uses id plus userId for direct reads and returns a non-enumerating 404', async () => {
    mocks.telegramBot.findFirst.mockResolvedValue(null);

    await expect(telegramBotManagementService.get('user-b', storedBot.id)).rejects.toMatchObject<TelegramBotManagementError>({
      status: 404,
      code: 'TELEGRAM_BOT_NOT_FOUND',
    });
    expect(mocks.telegramBot.findFirst).toHaveBeenCalledWith({
      where: { id: storedBot.id, userId: 'user-b', deletedAt: null },
    });
  });

  it('persists only encrypted token material when creating a bot', async () => {
    mocks.diagnose.mockResolvedValue({
      bot: {
        id: 407920985,
        firstName: 'Test Bot',
        username: 'test_bot',
        canJoinGroups: false,
        canReadAllGroupMessages: false,
        supportsInlineQueries: false,
      },
      webhook: {
        configured: false,
        url: null,
        host: null,
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        maxConnections: null,
        allowedUpdates: [],
      },
    });
    mocks.telegramBot.findUnique.mockResolvedValue(null);
    mocks.telegramBot.create.mockImplementation(async ({ data }) => ({
      ...storedBot,
      ...data,
      encryptedToken: 'encrypted',
      tokenKeyVersion: 1,
      tokenLast4: '2345',
      webhookSecretHash: null,
      webhookConnectedAt: null,
      status: 'DRAFT',
    }));
    const plaintextToken = '123456789:abcdefghijklmnopqrstuvwxyz_ABCDE12345';

    const result = await telegramBotManagementService.create('user-a', { token: plaintextToken });

    const createData = mocks.telegramBot.create.mock.calls[0][0].data;
    expect(createData.encryptedToken).toBe('encrypted');
    expect(JSON.stringify(createData)).not.toContain(plaintextToken);
    expect(result.bot).not.toHaveProperty('encryptedToken');
    expect(result.bot.tokenHint).toBe('••••2345');
  });

  it('does not call Telegram or mutate data when another user guesses a bot id', async () => {
    mocks.telegramBot.findFirst.mockResolvedValue(null);

    await expect(telegramBotManagementService.archive('user-b', storedBot.id)).rejects.toMatchObject({
      status: 404,
      code: 'TELEGRAM_BOT_NOT_FOUND',
    });
    expect(mocks.deleteWebhook).not.toHaveBeenCalled();
    expect(mocks.telegramBot.updateMany).not.toHaveBeenCalled();
  });

  it('does not replace a third-party webhook without explicit confirmation', async () => {
    mocks.telegramBot.findFirst.mockResolvedValue(storedBot);
    mocks.diagnose.mockResolvedValue({
      bot: { id: 407920985, firstName: 'Test Bot', username: 'test_bot' },
      webhook: {
        configured: true,
        url: 'https://example.bothelp.io/webhook',
        host: 'example.bothelp.io',
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        maxConnections: 40,
        allowedUpdates: ['message'],
      },
    });

    await expect(telegramBotManagementService.connectWebhook('user-a', storedBot.id, {
      replaceExistingWebhook: false,
      dropPendingUpdates: false,
    })).rejects.toMatchObject({
      status: 409,
      code: 'TELEGRAM_WEBHOOK_CONFLICT',
      details: { existingHost: 'example.bothelp.io' },
    });
    expect(mocks.setWebhook).not.toHaveBeenCalled();
    expect(mocks.telegramBot.updateMany).not.toHaveBeenCalled();
  });

  it('stores only a hash of the generated per-bot webhook secret', async () => {
    mocks.telegramBot.findFirst.mockResolvedValue(storedBot);
    mocks.telegramBot.updateMany.mockResolvedValue({ count: 1 });
    mocks.diagnose.mockResolvedValue({
      bot: { id: 407920985, firstName: 'Test Bot', username: 'test_bot' },
      webhook: {
        configured: false,
        url: null,
        host: null,
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        maxConnections: null,
        allowedUpdates: [],
      },
    });
    mocks.setWebhook.mockResolvedValue(undefined);

    await telegramBotManagementService.connectWebhook('user-a', storedBot.id, {
      replaceExistingWebhook: false,
      dropPendingUpdates: false,
    });

    const setWebhookInput = mocks.setWebhook.mock.calls[0][0];
    const preparedData = mocks.telegramBot.updateMany.mock.calls[0][0].data;
    expect(setWebhookInput.url).toBe(
      `https://api.lumaiq.ru/api/v1/telegram-bots/webhooks/${storedBot.publicBotKey}`,
    );
    expect(setWebhookInput.secretToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(preparedData.webhookSecretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preparedData.webhookSecretHash).not.toBe(setWebhookInput.secretToken);
    expect(JSON.stringify(preparedData)).not.toContain(setWebhookInput.secretToken);
  });

  it('removes encrypted token material when the owner archives a bot', async () => {
    mocks.telegramBot.findFirst.mockResolvedValue(storedBot);
    mocks.deleteWebhook.mockResolvedValue(undefined);
    mocks.telegramBot.updateMany.mockResolvedValue({ count: 1 });

    await telegramBotManagementService.archive('user-a', storedBot.id);

    expect(mocks.telegramBot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: storedBot.id, userId: 'user-a', deletedAt: null },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        encryptedToken: null,
        tokenLast4: null,
        webhookSecretHash: null,
      }),
    }));
  });
});
