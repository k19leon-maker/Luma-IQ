import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telegramBotFindFirst: vi.fn(),
  subscriberFindFirst: vi.fn(),
  subscriberCreate: vi.fn(),
  subscriberUpdateMany: vi.fn(),
  scenarioFindMany: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  enrollmentCreate: vi.fn(),
  enrollmentUpdateMany: vi.fn(),
  deliveryCreateMany: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => {
  const tx = {
    botSubscriber: { updateMany: mocks.subscriberUpdateMany },
    botScenarioEnrollment: {
      findFirst: mocks.enrollmentFindFirst,
      create: mocks.enrollmentCreate,
      updateMany: mocks.enrollmentUpdateMany,
    },
    botMessageDelivery: {
      createMany: mocks.deliveryCreateMany,
      updateMany: mocks.deliveryUpdateMany,
    },
  };
  return {
    prisma: {
      telegramBot: { findFirst: mocks.telegramBotFindFirst },
      botSubscriber: {
        findFirst: mocks.subscriberFindFirst,
        create: mocks.subscriberCreate,
        updateMany: mocks.subscriberUpdateMany,
      },
      botScenario: { findMany: mocks.scenarioFindMany },
      botScenarioEnrollment: { findFirst: mocks.enrollmentFindFirst },
      $transaction: mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

import { telegramRuntimeV2Service } from '../../src/services/telegram-runtime-v2.service';

const validDefinition = {
  schemaVersion: '1.0',
  name: 'Welcome',
  timezone: 'Europe/Moscow',
  entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'welcome' }],
  variables: [],
  nodes: [
    { id: 'welcome', type: 'send_message', text: 'Привет, {{first_name}}!', parseMode: 'plain', disableWebPreview: false },
    { id: 'end', type: 'end' },
  ],
  edges: [{ id: 'to_end', fromNodeId: 'welcome', toNodeId: 'end' }],
  goals: [],
  metadata: { locale: 'ru', source: 'manual' },
};

const update = {
  id: 'update-row-a',
  userId: 'user-a',
  botId: 'bot-a',
  telegramUpdateId: '700',
  payload: {
    update_id: 700,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      text: '/start',
      chat: { id: 42, type: 'private' },
      from: { id: 42, first_name: 'Анна', username: 'anna' },
    },
  },
};

describe('telegramRuntimeV2Service ownership isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      botSubscriber: { updateMany: mocks.subscriberUpdateMany },
      botScenarioEnrollment: {
        findFirst: mocks.enrollmentFindFirst,
        create: mocks.enrollmentCreate,
        updateMany: mocks.enrollmentUpdateMany,
      },
      botMessageDelivery: {
        createMany: mocks.deliveryCreateMany,
        updateMany: mocks.deliveryUpdateMany,
      },
    }));
  });

  it('ignores a queued update when bot ownership no longer matches', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue(null);

    await expect(telegramRuntimeV2Service.processInboundUpdate(update)).resolves.toEqual({ outcome: 'ignored' });

    expect(mocks.telegramBotFindFirst).toHaveBeenCalledWith({
      where: { id: 'bot-a', userId: 'user-a', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    expect(mocks.subscriberFindFirst).not.toHaveBeenCalled();
  });

  it('creates an owner-scoped subscriber, enrollment and idempotent first delivery', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.scenarioFindMany.mockResolvedValue([{
      id: 'scenario-a',
      publishedVersionId: 'version-a',
      publishedVersion: { id: 'version-a', definition: validDefinition },
    }]);
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.enrollmentCreate.mockResolvedValue({ id: 'enrollment-a' });
    mocks.deliveryCreateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processInboundUpdate(update);

    expect(result).toMatchObject({
      outcome: 'enrolled',
      subscriberId: 'subscriber-a',
      enrollmentId: 'enrollment-a',
    });
    expect(mocks.subscriberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', telegramUserId: '42' }),
    });
    expect(mocks.scenarioFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', status: 'PUBLISHED' }),
    }));
    expect(mocks.deliveryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        subscriberId: 'subscriber-a',
        enrollmentId: 'enrollment-a',
        idempotencyKey: 'enrollment-a:welcome',
      })],
      skipDuplicates: true,
    });
  });

  it('scopes /stop across subscriber, enrollments and pending deliveries', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue({ id: 'subscriber-a' });
    mocks.subscriberUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 2 });
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 3 });

    const stopUpdate = {
      ...update,
      telegramUpdateId: '701',
      payload: {
        ...update.payload,
        update_id: 701,
        message: { ...update.payload.message, text: '/stop' },
      },
    };
    const result = await telegramRuntimeV2Service.processInboundUpdate(stopUpdate);

    expect(result).toMatchObject({ outcome: 'stopped', subscriberId: 'subscriber-a' });
    expect(mocks.enrollmentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', subscriberId: 'subscriber-a' }),
    }));
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', subscriberId: 'subscriber-a', status: 'PENDING' }),
    }));
  });
});
