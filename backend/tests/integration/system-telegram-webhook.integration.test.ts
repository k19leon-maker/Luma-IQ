import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ ingest: vi.fn() }));

vi.mock('../../src/services/system-telegram-webhook.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/system-telegram-webhook.service')>();
  return {
    ...actual,
    systemTelegramWebhookService: { ingest: mocks.ingest },
  };
});

import { systemTelegramController } from '../../src/controllers/system-telegram.controller';

function responseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('system Telegram webhook route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acknowledges a queued update without invoking the long-running handler', async () => {
    mocks.ingest.mockResolvedValue({ queued: true, duplicate: false, ignored: false });
    const response = responseMock();
    await systemTelegramController.webhook({
      body: { update_id: 701, message: { text: '/start' } },
      header: vi.fn().mockReturnValue('secret'),
    } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      queued: true,
      duplicate: false,
      ignored: false,
    });
    expect(mocks.ingest).toHaveBeenCalledOnce();
  });

  it('rejects malformed input before queue access', async () => {
    const response = responseMock();
    await systemTelegramController.webhook({
      body: { message: { text: '/start' } },
      header: vi.fn(),
    } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'INVALID_SYSTEM_TELEGRAM_UPDATE' });
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
});
