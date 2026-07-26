import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn() },
    billingPeriod: { updateMany: vi.fn() },
    userEvent: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    subscriptionFindUnique: vi.fn(),
    getOrCreateCurrent: vi.fn(),
  };
});

vi.mock('../../src/config/env', () => ({
  env: {
    YOOKASSA_ENABLED: true,
    YOOKASSA_SHOP_ID: 'test',
    YOOKASSA_SECRET_KEY: 'test',
    YOOKASSA_RETURN_URL: 'https://example.com/return',
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
}));

vi.mock('../../src/services/billing-period.service', () => ({
  billingPeriodService: { getOrCreateCurrent: mocks.getOrCreateCurrent },
}));

vi.mock('../../src/services/plan-catalog.service', () => ({
  planCatalogService: { isPurchasable: vi.fn().mockResolvedValue(true) },
}));

import { paymentService } from '../../src/services/payment.service';

describe('payment webhook idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.subscription.findUnique.mockResolvedValue({
      plan: 'FREE',
      status: 'ACTIVE',
    });
    mocks.tx.subscription.upsert.mockResolvedValue({
      id: 'subscription-1',
      userId: 'user-1',
      plan: 'START',
    });
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: 'subscription-1',
      userId: 'user-1',
      plan: 'START',
    });
  });

  it('activates the plan only once when YooKassa repeats a successful webhook', async () => {
    mocks.tx.payment.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
        status: 'PENDING',
        metadata: { plan: 'START' },
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
        status: 'SUCCEEDED',
        metadata: { plan: 'START' },
      });

    const event = {
      event: 'payment.succeeded',
      object: {
        id: 'yookassa-1',
        status: 'succeeded',
        metadata: { userId: 'user-1', plan: 'START' },
      },
    };

    await paymentService.handleWebhook(event);
    await paymentService.handleWebhook(event);

    expect(mocks.tx.payment.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.tx.billingPeriod.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.userEvent.create).toHaveBeenCalledTimes(1);
  });
});
