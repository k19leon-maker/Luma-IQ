import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    payment: { findUnique: vi.fn(), updateMany: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn() },
    billingPeriod: { updateMany: vi.fn() },
    userEvent: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    paymentFindUnique: vi.fn(),
    userEventCreate: vi.fn(),
    subscriptionFindUnique: vi.fn(),
    getOrCreateCurrent: vi.fn(),
    providerGetPayment: vi.fn(),
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
    payment: { findUnique: mocks.paymentFindUnique },
    userEvent: { create: mocks.userEventCreate },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
}));

vi.mock('../../src/services/billing-period.service', () => ({
  billingPeriodService: { getOrCreateCurrent: mocks.getOrCreateCurrent },
}));

vi.mock('../../src/services/plan-catalog.service', () => ({
  planCatalogService: { isPurchasable: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../src/services/yookassa.service', () => ({
  yookassaService: { getPayment: mocks.providerGetPayment },
}));

import { paymentService } from '../../src/services/payment.service';

describe('payment webhook idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userEventCreate.mockResolvedValue(undefined);
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
    mocks.providerGetPayment.mockResolvedValue({
      id: 'yookassa-1',
      status: 'succeeded',
      paid: true,
      amount: { value: '7900.00', currency: 'RUB' },
      metadata: { userId: 'user-1', plan: 'START' },
      confirmation: { confirmation_url: 'https://yookassa.test/confirm' },
    });
  });

  it('activates the plan only once when YooKassa repeats a successful webhook', async () => {
    const pendingPayment = {
      id: 'payment-1',
      userId: 'user-1',
      status: 'PENDING',
      amount: '7900.00',
      currency: 'RUB',
      metadata: { userId: 'user-1', plan: 'START' },
    };
    const succeededPayment = { ...pendingPayment, status: 'SUCCEEDED' };
    mocks.paymentFindUnique
      .mockResolvedValueOnce({
        ...pendingPayment,
      })
      .mockResolvedValueOnce({
        ...succeededPayment,
      });
    mocks.tx.payment.findUnique
      .mockResolvedValueOnce(pendingPayment)
      .mockResolvedValueOnce(succeededPayment);
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 1 });

    const event = {
      event: 'payment.succeeded',
      object: {
        id: 'yookassa-1',
      },
    };

    await paymentService.handleWebhook(event);
    await paymentService.handleWebhook(event);

    expect(mocks.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.tx.billingPeriod.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.userEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a webhook when the provider amount differs from the server payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      status: 'PENDING',
      amount: '7900.00',
      currency: 'RUB',
      metadata: { userId: 'user-1', plan: 'START' },
    });
    mocks.providerGetPayment.mockResolvedValue({
      id: 'yookassa-1',
      status: 'succeeded',
      paid: true,
      amount: { value: '1.00', currency: 'RUB' },
      metadata: { userId: 'user-1', plan: 'START' },
      confirmation: { confirmation_url: 'https://yookassa.test/confirm' },
    });

    await paymentService.handleWebhook({ event: 'payment.succeeded', object: { id: 'yookassa-1' } });

    expect(mocks.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.subscription.upsert).not.toHaveBeenCalled();
    expect(mocks.userEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'payment_webhook_rejected',
        metadata: expect.objectContaining({ reason: 'provider_payment_mismatch' }),
      }),
    });
  });

  it('rejects an unknown provider payment without querying YooKassa', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null);

    await paymentService.handleWebhook({ event: 'payment.succeeded', object: { id: 'unknown-payment' } });

    expect(mocks.providerGetPayment).not.toHaveBeenCalled();
    expect(mocks.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.userEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'payment_webhook_rejected',
        metadata: expect.objectContaining({ reason: 'payment_not_found' }),
      }),
    });
  });

  it('rejects a provider payment whose plan metadata does not match the server payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      status: 'PENDING',
      amount: '7900.00',
      currency: 'RUB',
      metadata: { userId: 'user-1', plan: 'START' },
    });
    mocks.providerGetPayment.mockResolvedValue({
      id: 'yookassa-1',
      status: 'succeeded',
      paid: true,
      amount: { value: '7900.00', currency: 'RUB' },
      metadata: { userId: 'user-1', plan: 'EVERGREEN_FUNNEL' },
      confirmation: { confirmation_url: 'https://yookassa.test/confirm' },
    });

    await paymentService.handleWebhook({ event: 'payment.succeeded', object: { id: 'yookassa-1' } });

    expect(mocks.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.subscription.upsert).not.toHaveBeenCalled();
  });
});
