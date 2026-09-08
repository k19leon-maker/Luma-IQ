import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  telegramBot: { findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
  botSubscriber: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
  botScenarioEnrollment: { count: vi.fn() },
  botMessageDelivery: { count: vi.fn() },
  botEvent: { count: vi.fn(), create: vi.fn() },
}));
vi.mock('../../src/lib/prisma', () => ({ prisma: db }));

import { telegramAudienceService } from '../../src/services/telegram-audience.service';

describe('telegramAudienceService tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.telegramBot.findFirst.mockResolvedValue({ id: 'bot-a', username: 'safe_bot', displayName: 'Safe', status: 'ACTIVE' });
  });

  it('scopes list and count to both owner and bot', async () => {
    db.botSubscriber.count.mockResolvedValue(0);
    db.botSubscriber.findMany.mockResolvedValue([]);
    await telegramAudienceService.listSubscribers('user-a', 'bot-a', { limit: 50, offset: 0 });
    expect(db.telegramBot.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bot-a', userId: 'user-a', deletedAt: null } }));
    expect(db.botSubscriber.count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', archivedAt: null }) });
    expect(db.botSubscriber.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a' }),
      select: expect.not.objectContaining({ telegramUserId: true, telegramChatId: true, phone: true, email: true }),
    }));
  });

  it('uses owner and bot when resolving a subscriber id', async () => {
    db.botSubscriber.findFirst.mockResolvedValue(null);
    await expect(telegramAudienceService.getSubscriber('user-b', 'bot-a', 'subscriber-from-a')).rejects.toMatchObject({ status: 404 });
    expect(db.botSubscriber.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'subscriber-from-a', userId: 'user-b', botId: 'bot-a' }) }));
  });

  it('escapes spreadsheet formulas and writes an export audit event', async () => {
    db.botSubscriber.findMany.mockResolvedValue([{
      id: '=unsafe', username: '+formula', firstName: 'Анна', lastName: null, languageCode: 'ru',
      status: 'ACTIVE', source: 'start', firstSeenAt: new Date('2026-09-01T10:00:00Z'), lastSeenAt: new Date('2026-09-02T10:00:00Z'),
      tags: [], enrollments: [],
    }]);
    db.botEvent.create.mockResolvedValue({ id: 'audit' });
    const result = await telegramAudienceService.exportSubscribersCsv('user-a', 'bot-a', {});
    expect(result.csv).toContain("\"'=unsafe\"");
    expect(result.csv).toContain("\"'+formula\"");
    expect(db.botEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', eventType: 'AUDIENCE_CSV_EXPORTED' }) });
  });
});
