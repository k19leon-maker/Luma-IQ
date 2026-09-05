import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inboundFindUnique: vi.fn(),
  inboundUpdateMany: vi.fn(),
  deliveryFindUnique: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  deliveryCount: vi.fn(),
  enrollmentUpdateMany: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => {
  const tx = {
    botInboundUpdate: {
      findUnique: mocks.inboundFindUnique,
      updateMany: mocks.inboundUpdateMany,
    },
    botMessageDelivery: {
      findUnique: mocks.deliveryFindUnique,
      updateMany: mocks.deliveryUpdateMany,
      count: mocks.deliveryCount,
    },
    botScenarioEnrollment: { updateMany: mocks.enrollmentUpdateMany },
    botEvent: { create: mocks.eventCreate },
  };
  return {
    prisma: {
      $transaction: mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

import { telegramRuntimeAdminService } from '../../src/services/telegram-runtime-admin.service';

const deadInbound = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'owner-a',
  botId: 'bot-a',
  status: 'DEAD',
  attempts: 5,
};

const deadDelivery = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: 'owner-b',
  botId: 'bot-b',
  subscriberId: 'subscriber-b',
  enrollmentId: 'enrollment-b',
  scenarioId: 'scenario-b',
  nodeId: 'message-b',
  payload: { kind: 'send_message' },
  status: 'DEAD',
  attempts: 5,
  telegramMessageId: null,
  sentAt: null,
  lastErrorCode: 'TELEGRAM_API_ERROR',
  bot: { status: 'ACTIVE', deletedAt: null },
  subscriber: { status: 'ACTIVE', archivedAt: null },
  enrollment: { id: 'enrollment-b', status: 'FAILED', currentNodeId: 'message-b' },
};

describe('telegramRuntimeAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      botInboundUpdate: { findUnique: mocks.inboundFindUnique, updateMany: mocks.inboundUpdateMany },
      botMessageDelivery: {
        findUnique: mocks.deliveryFindUnique,
        updateMany: mocks.deliveryUpdateMany,
        count: mocks.deliveryCount,
      },
      botScenarioEnrollment: { updateMany: mocks.enrollmentUpdateMany },
      botEvent: { create: mocks.eventCreate },
    }));
    mocks.inboundUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deliveryCount.mockResolvedValue(0);
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.eventCreate.mockResolvedValue({ id: 'event-id' });
  });

  it('recovers inbound using ownership stored on the job, not request input', async () => {
    mocks.inboundFindUnique.mockResolvedValue(deadInbound);

    await expect(telegramRuntimeAdminService.recoverJob(
      'inbound',
      deadInbound.id,
      'admin-user',
    )).resolves.toMatchObject({ queue: 'inbound', jobId: deadInbound.id, status: 'PENDING' });

    expect(mocks.inboundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'owner-a', botId: 'bot-a', status: 'DEAD' }),
    }));
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-a',
        botId: 'bot-a',
        eventType: 'ADMIN_INBOUND_JOB_RECOVERED',
        metadata: expect.objectContaining({ adminUserId: 'admin-user' }),
      }),
    });
  });

  it('keeps recovery audit and mutations isolated for two different owners', async () => {
    const ownerBInbound = {
      ...deadInbound,
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'owner-b',
      botId: 'bot-b',
    };
    mocks.inboundFindUnique
      .mockResolvedValueOnce(deadInbound)
      .mockResolvedValueOnce(ownerBInbound);

    await telegramRuntimeAdminService.recoverJob('inbound', deadInbound.id, 'admin-user');
    await telegramRuntimeAdminService.recoverJob('inbound', ownerBInbound.id, 'admin-user');

    expect(mocks.inboundUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: deadInbound.id, userId: 'owner-a', botId: 'bot-a' }),
    }));
    expect(mocks.inboundUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: ownerBInbound.id, userId: 'owner-b', botId: 'bot-b' }),
    }));
    expect(mocks.eventCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ userId: 'owner-a', botId: 'bot-a' }),
    });
    expect(mocks.eventCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ userId: 'owner-b', botId: 'bot-b' }),
    });
  });

  it('recovers a safe delivery and restores only its owner-scoped enrollment', async () => {
    mocks.deliveryFindUnique.mockResolvedValue(deadDelivery);

    await expect(telegramRuntimeAdminService.recoverJob(
      'delivery',
      deadDelivery.id,
      'admin-user',
    )).resolves.toMatchObject({ queue: 'delivery', jobId: deadDelivery.id, status: 'PENDING' });

    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner-b',
        botId: 'bot-b',
        subscriberId: 'subscriber-b',
        status: 'DEAD',
      }),
    }));
    expect(mocks.enrollmentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'enrollment-b',
        userId: 'owner-b',
        botId: 'bot-b',
        subscriberId: 'subscriber-b',
      }),
    }));
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'owner-b', botId: 'bot-b' }),
    });
  });

  it('blocks retry when Telegram may already have accepted the message', async () => {
    mocks.deliveryFindUnique.mockResolvedValue({
      ...deadDelivery,
      lastErrorCode: 'DELIVERY_OUTCOME_UNKNOWN',
    });

    await expect(telegramRuntimeAdminService.recoverJob(
      'delivery',
      deadDelivery.id,
      'admin-user',
    )).rejects.toMatchObject({ status: 409, code: 'DELIVERY_OUTCOME_UNKNOWN' });
    expect(mocks.deliveryUpdateMany).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it('does not recover a delivery when the same owner enrollment already sent the node', async () => {
    mocks.deliveryFindUnique.mockResolvedValue(deadDelivery);
    mocks.deliveryCount.mockResolvedValue(1);

    await expect(telegramRuntimeAdminService.recoverJob(
      'delivery',
      deadDelivery.id,
      'admin-user',
    )).rejects.toMatchObject({ status: 409, code: 'DELIVERY_DUPLICATE_RISK' });
    expect(mocks.deliveryCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'owner-b',
        botId: 'bot-b',
        subscriberId: 'subscriber-b',
      }),
    });
    expect(mocks.deliveryUpdateMany).not.toHaveBeenCalled();
  });
});
