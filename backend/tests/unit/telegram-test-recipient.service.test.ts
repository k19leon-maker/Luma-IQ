import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  botFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  eventFindFirst: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramBot: { findFirst: mocks.botFindFirst },
    botEvent: { create: mocks.eventCreate, findFirst: mocks.eventFindFirst },
  },
}));

import { telegramTestRecipientService } from '../../src/services/telegram-test-recipient.service';

describe('telegramTestRecipientService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores only a digest and returns a short-lived Telegram deep link', async () => {
    mocks.botFindFirst.mockResolvedValue({ id: 'bot-a', username: 'owner_bot', status: 'ACTIVE' });
    mocks.eventCreate.mockResolvedValue({ id: 'event-a' });

    const result = await telegramTestRecipientService.createVerification('user-a', 'bot-a');
    const token = new URL(result.deepLink).searchParams.get('start')!.replace('luma_test_', '');
    const digest = createHash('sha256').update(token).digest('hex');

    expect(token).toHaveLength(32);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        eventType: 'OWNER_TEST_VERIFICATION_CREATED',
        sourceId: digest,
        idempotencyKey: `owner-test-verification:${digest}`,
      }),
    });
    expect(JSON.stringify(mocks.eventCreate.mock.calls[0][0])).not.toContain(token);
  });

  it('accepts a valid token only in a private chat and records the scoped subscriber', async () => {
    const token = 'abcdefghijklmnopqrstuvwxyz123456';
    const digest = createHash('sha256').update(token).digest('hex');
    mocks.eventFindFirst.mockResolvedValue({
      id: 'pending-a',
      metadata: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    mocks.eventCreate.mockResolvedValue({ id: 'verified-a' });

    await expect(telegramTestRecipientService.consumeVerification({
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      telegramUserId: '42',
      telegramChatId: '-100',
      startParameter: `luma_test_${token}`,
    })).resolves.toBe(false);
    expect(mocks.eventFindFirst).not.toHaveBeenCalled();

    await expect(telegramTestRecipientService.consumeVerification({
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      telegramUserId: '42',
      telegramChatId: '42',
      startParameter: `luma_test_${token}`,
    })).resolves.toBe(true);

    expect(mocks.eventFindFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        botId: 'bot-a',
        eventType: 'OWNER_TEST_VERIFICATION_CREATED',
        sourceId: digest,
      },
      select: { id: true, metadata: true },
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        subscriberId: 'subscriber-a',
        eventType: 'OWNER_TEST_RECIPIENT_VERIFIED',
      }),
    });
  });

  it('reads a verified recipient through owner and bot scoped relations', async () => {
    mocks.botFindFirst.mockResolvedValue({ id: 'bot-a', username: 'owner_bot', status: 'ACTIVE' });
    mocks.eventFindFirst.mockResolvedValue({
      subscriberId: 'subscriber-a',
      createdAt: new Date(),
      subscriber: { id: 'subscriber-a', telegramChatId: '42', username: 'owner' },
    });

    await expect(telegramTestRecipientService.getVerifiedRecipient('user-a', 'bot-a'))
      .resolves.toMatchObject({ id: 'subscriber-a', telegramChatId: '42' });
    expect(mocks.eventFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        subscriber: { userId: 'user-a', botId: 'bot-a', status: 'ACTIVE', archivedAt: null },
      }),
    }));
  });
});
