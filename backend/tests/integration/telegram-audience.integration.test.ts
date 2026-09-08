import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const mocks = vi.hoisted(() => ({
  listSubscribers: vi.fn(),
  getSubscriber: vi.fn(),
  analytics: vi.fn(),
  exportSubscribersCsv: vi.fn(),
}));

vi.mock('../../src/services/telegram-audience.service', () => {
  class TelegramAudienceError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return { TelegramAudienceError, telegramAudienceService: mocks };
});

import { createApp } from '../../src/app';
import { TelegramAudienceError } from '../../src/services/telegram-audience.service';

const botId = '11111111-1111-4111-8111-111111111111';
const subscriberId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const auth = (userId: string) => `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;

describe('Telegram audience API isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication and derives owner from the session', async () => {
    await request(createApp()).get(`/api/v1/telegram-bots/${botId}/audience/subscribers`).expect(401);
    mocks.listSubscribers.mockResolvedValue({ subscribers: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } });

    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/audience/subscribers?status=ACTIVE&userId=user-b`)
      .set('Authorization', auth('user-a'))
      .expect(400);
    expect(mocks.listSubscribers).not.toHaveBeenCalled();

    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/audience/subscribers?status=ACTIVE`)
      .set('Authorization', auth('user-a'))
      .expect(200);
    expect(mocks.listSubscribers).toHaveBeenCalledWith('user-a', botId, expect.objectContaining({ status: 'ACTIVE' }));
  });

  it('does not reveal a subscriber guessed across tenants', async () => {
    mocks.getSubscriber.mockRejectedValue(new TelegramAudienceError('Подписчик не найден', 404, 'TELEGRAM_SUBSCRIBER_NOT_FOUND'));
    const response = await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/audience/subscribers/${subscriberId}`)
      .set('Authorization', auth('user-b'))
      .expect(404);
    expect(response.body.error).toBe('TELEGRAM_SUBSCRIBER_NOT_FOUND');
    expect(mocks.getSubscriber).toHaveBeenCalledWith('user-b', botId, subscriberId);
  });

  it('passes only authenticated owner and validated project to analytics', async () => {
    mocks.analytics.mockResolvedValue({ metrics: {}, semantics: { telegramReadReceiptsSupported: false } });
    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/audience/analytics?projectId=${projectId}`)
      .set('Authorization', auth('user-a'))
      .expect(200);
    expect(mocks.analytics).toHaveBeenCalledWith('user-a', botId, { projectId });
  });

  it('returns an audited CSV payload through the owner-scoped service', async () => {
    mocks.exportSubscribersCsv.mockResolvedValue({ fileName: 'safe.csv', csv: '\uFEFF"subscriber_id"\r\n"one"', rows: 1 });
    const response = await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/audience/subscribers.csv`)
      .set('Authorization', auth('user-a'))
      .expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['x-exported-rows']).toBe('1');
    expect(mocks.exportSubscribersCsv).toHaveBeenCalledWith('user-a', botId, {});
  });
});
