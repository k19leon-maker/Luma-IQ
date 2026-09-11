import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  process: vi.fn(),
}));

vi.mock('../../src/config/env', () => ({
  env: {
    SYSTEM_TELEGRAM_ENABLED: true,
    SYSTEM_TELEGRAM_WORKER_ENABLED: true,
    SYSTEM_TELEGRAM_BOT_TOKEN: 'token',
    SYSTEM_TELEGRAM_WEBHOOK_SECRET: 'secret',
    SYSTEM_TELEGRAM_LOCK_TIMEOUT_SECONDS: 300,
    SYSTEM_TELEGRAM_BATCH_SIZE: 10,
    SYSTEM_TELEGRAM_POLL_INTERVAL_MS: 1_000,
  },
}));
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemTelegramUpdate: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock('../../src/services/system-telegram-handler.service', () => ({
  systemTelegramHandlerService: { process: mocks.process },
}));

import { TelegramBotApiError } from '../../src/services/telegram-bot.service';
import { systemTelegramWorkerService } from '../../src/services/system-telegram-worker.service';

const candidate = {
  id: 'update-1',
  telegramAccountId: null,
  telegramUpdateId: '501',
  kind: 'message',
  payload: { message: { text: '/start' } },
  status: 'PENDING',
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: null,
  lockedAt: null,
  lockedBy: null,
  processedAt: null,
  failedAt: null,
  outcome: null,
  lastErrorCode: null,
  lastError: null,
  receivedAt: new Date(),
  updatedAt: new Date(),
};

describe('system Telegram worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValueOnce(candidate).mockResolvedValueOnce(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it('keeps the worker lock through completion', async () => {
    mocks.process.mockResolvedValue({ outcome: 'WORKSPACE_LINK_SENT', telegramAccountId: 'account-1' });
    await expect(systemTelegramWorkerService.processOnce('worker-1')).resolves.toEqual({ processed: 1, failed: 0 });

    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'update-1', status: 'PROCESSING', lockedBy: 'worker-1' },
      data: expect.objectContaining({ status: 'PROCESSED', outcome: 'WORKSPACE_LINK_SENT' }),
    }));
  });

  it('retries only an explicit Telegram API rejection', async () => {
    mocks.process.mockRejectedValue(new TelegramBotApiError('rate', {
      code: 'TELEGRAM_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 5,
    }));
    await expect(systemTelegramWorkerService.processOnce('worker-2')).resolves.toEqual({ processed: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'update-1', status: 'PROCESSING', lockedBy: 'worker-2' },
      data: expect.objectContaining({ status: 'PENDING', lastErrorCode: 'TELEGRAM_RATE_LIMITED' }),
    }));
  });

  it('moves an ambiguous timeout to dead-letter instead of duplicating an external action', async () => {
    mocks.process.mockRejectedValue(new TelegramBotApiError('timeout', {
      code: 'TELEGRAM_API_TIMEOUT',
      status: 504,
    }));
    await systemTelegramWorkerService.processOnce('worker-3');
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ status: 'DEAD', nextAttemptAt: null }),
    }));
  });

  it('does not touch customer bot subscribers, inbound updates or bot tokens', () => {
    const root = resolve(__dirname, '../../src');
    const source = [
      'services/system-telegram-webhook.service.ts',
      'services/system-telegram-handler.service.ts',
      'services/system-telegram-worker.service.ts',
    ].map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');

    expect(source).not.toContain('botSubscriber');
    expect(source).not.toContain('botInboundUpdate');
    expect(source).not.toContain('telegramBot.find');
    expect(source).not.toContain('tokenEncrypted');
  });
});
