import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  env: {
    SYSTEM_TELEGRAM_ENABLED: true,
    SYSTEM_TELEGRAM_WORKER_ENABLED: true,
    SYSTEM_TELEGRAM_BOT_TOKEN: 'token',
    SYSTEM_TELEGRAM_WEBHOOK_SECRET: 'secret',
    SYSTEM_TELEGRAM_ALLOWED_USER_IDS: '101',
    SYSTEM_TELEGRAM_ALLOW_ALL: false,
  },
}));

vi.mock('../../src/config/env', () => ({ env: mocks.env }));
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemTelegramUpdate: {
      groupBy: mocks.groupBy,
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
    },
  },
}));

import { systemTelegramAdminService } from '../../src/services/system-telegram-admin.service';

describe('system Telegram diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.env, {
      SYSTEM_TELEGRAM_ENABLED: true,
      SYSTEM_TELEGRAM_WORKER_ENABLED: true,
      SYSTEM_TELEGRAM_BOT_TOKEN: 'token',
      SYSTEM_TELEGRAM_WEBHOOK_SECRET: 'secret',
      SYSTEM_TELEGRAM_ALLOWED_USER_IDS: '101',
      SYSTEM_TELEGRAM_ALLOW_ALL: false,
    });
    mocks.groupBy.mockResolvedValue([{ status: 'PROCESSED', _count: { _all: 4 } }]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
  });

  it('returns aggregate queue metrics without message payloads or Telegram identifiers', async () => {
    const snapshot = await systemTelegramAdminService.snapshot();
    expect(snapshot.queue.counts).toEqual({ PENDING: 0, PROCESSING: 0, PROCESSED: 4, DEAD: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ payload: true, telegramUpdateId: true }),
    }));
    expect(JSON.stringify(snapshot)).not.toContain('system-bot-token');
    expect(JSON.stringify(snapshot)).not.toContain('system-webhook-secret');
  });

  it('fails health when enabled without a worker or safe audience boundary', async () => {
    mocks.env.SYSTEM_TELEGRAM_WORKER_ENABLED = false;
    await expect(systemTelegramAdminService.health()).resolves.toMatchObject({
      status: 'fail',
      details: { reason: 'worker_disabled' },
    });

    mocks.env.SYSTEM_TELEGRAM_WORKER_ENABLED = true;
    mocks.env.SYSTEM_TELEGRAM_ALLOWED_USER_IDS = '*';
    await expect(systemTelegramAdminService.health()).resolves.toMatchObject({
      status: 'fail',
      details: { reason: 'configuration_incomplete' },
    });
  });

  it('warns on dead letters while keeping secrets out of health output', async () => {
    mocks.groupBy.mockResolvedValue([{ status: 'DEAD', _count: { _all: 1 } }]);
    const health = await systemTelegramAdminService.health();
    expect(health.status).toBe('warn');
    expect(JSON.stringify(health)).not.toContain('system-bot-token');
    expect(JSON.stringify(health)).not.toContain('system-webhook-secret');
  });
});
