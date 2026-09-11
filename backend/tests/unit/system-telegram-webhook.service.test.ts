import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  env: {
    SYSTEM_TELEGRAM_ENABLED: true,
    SYSTEM_TELEGRAM_BOT_TOKEN: 'system-bot-token',
    SYSTEM_TELEGRAM_WEBHOOK_SECRET: 'system-webhook-secret',
    SYSTEM_TELEGRAM_ALLOWED_USER_IDS: '101',
    SYSTEM_TELEGRAM_ALLOW_ALL: false,
  },
}));

vi.mock('../../src/config/env', () => ({ env: mocks.env }));
vi.mock('../../src/lib/prisma', () => ({
  prisma: { systemTelegramUpdate: { create: mocks.create } },
}));

import {
  SystemTelegramWebhookError,
  allowedSystemTelegramUserIds,
  systemTelegramWebhookService,
} from '../../src/services/system-telegram-webhook.service';

describe('system Telegram webhook isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.env, {
      SYSTEM_TELEGRAM_ENABLED: true,
      SYSTEM_TELEGRAM_BOT_TOKEN: 'system-bot-token',
      SYSTEM_TELEGRAM_WEBHOOK_SECRET: 'system-webhook-secret',
      SYSTEM_TELEGRAM_ALLOWED_USER_IDS: '101',
      SYSTEM_TELEGRAM_ALLOW_ALL: false,
    });
  });

  it('authenticates, allowlists and queues only in the system ledger', async () => {
    mocks.create.mockResolvedValue({ id: 'system-update-1' });
    const result = await systemTelegramWebhookService.ingest({
      receivedSecret: 'system-webhook-secret',
      update: { update_id: 501, message: { from: { id: 101 }, text: '/start' } },
    });

    expect(result).toEqual({ queued: true, duplicate: false, ignored: false });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telegramUpdateId: '501',
        kind: 'message',
        status: 'PENDING',
      }),
    });
  });

  it('ignores a non-allowlisted actor without persisting its payload', async () => {
    const result = await systemTelegramWebhookService.ingest({
      receivedSecret: 'system-webhook-secret',
      update: { update_id: 502, message: { from: { id: 202 }, text: 'private' } },
    });

    expect(result).toEqual({ queued: false, duplicate: false, ignored: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('requires a separate opt-in before wildcard access becomes active', async () => {
    mocks.env.SYSTEM_TELEGRAM_ALLOWED_USER_IDS = '*';
    await expect(systemTelegramWebhookService.ingest({
      receivedSecret: 'system-webhook-secret',
      update: { update_id: 503, edited_message: { from: { id: 202 }, text: 'edited' } },
    })).resolves.toEqual({ queued: false, duplicate: false, ignored: true });

    mocks.env.SYSTEM_TELEGRAM_ALLOW_ALL = true;
    mocks.create.mockResolvedValue({ id: 'system-update-2' });
    await expect(systemTelegramWebhookService.ingest({
      receivedSecret: 'system-webhook-secret',
      update: { update_id: 504, edited_message: { from: { id: 202 }, text: 'edited' } },
    })).resolves.toEqual({ queued: true, duplicate: false, ignored: false });
  });

  it('rejects a wrong secret and acknowledges duplicate updates', async () => {
    await expect(systemTelegramWebhookService.ingest({
      receivedSecret: 'wrong',
      update: { update_id: 505, message: { from: { id: 101 } } },
    })).rejects.toBeInstanceOf(SystemTelegramWebhookError);

    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '7.8.0',
    }));
    await expect(systemTelegramWebhookService.ingest({
      receivedSecret: 'system-webhook-secret',
      update: { update_id: 505, callback_query: { from: { id: 101 } } },
    })).resolves.toEqual({ queued: false, duplicate: true, ignored: false });
  });

  it('normalizes an explicit allowlist without duplicates', () => {
    expect(allowedSystemTelegramUserIds(' 101,202,101 ')).toEqual(['101', '202']);
    expect(allowedSystemTelegramUserIds('*')).toBeNull();
  });
});
