import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

const mocks = vi.hoisted(() => {
  const tx = {
    checkoutIntent: { create: vi.fn() },
    consentLog: { create: vi.fn() },
  };
  return {
    tx,
    checkoutIntentFindUnique: vi.fn(),
    checkoutIntentCount: vi.fn(),
    checkoutIntentUpdate: vi.fn(),
    paymentAttemptCreate: vi.fn(),
    paymentAttemptUpdate: vi.fn(),
    transaction: vi.fn(),
    createProviderPayment: vi.fn(),
  };
});

vi.mock('../../src/config/env', () => ({
  env: {
    CHECKOUT_INTENT_TTL_HOURS: 24,
    CHECKOUT_RETURN_URL: 'https://www.lumaiq.ru/payment/return',
  },
}));

vi.mock('../../src/services/plan-catalog.service', () => ({
  planCatalogService: { isPurchasable: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../src/services/yookassa.service', () => ({
  yookassaService: { createPayment: mocks.createProviderPayment },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    checkoutIntent: {
      findUnique: mocks.checkoutIntentFindUnique,
      count: mocks.checkoutIntentCount,
      update: mocks.checkoutIntentUpdate,
    },
    checkoutPaymentAttempt: {
      create: mocks.paymentAttemptCreate,
      update: mocks.paymentAttemptUpdate,
    },
    consentLog: { create: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { checkoutService } from '../../src/services/checkout.service';

const consents = {
  privacyAccepted: true as const,
  personalDataAccepted: true as const,
  offerAccepted: true as const,
  documentVersion: 'v1',
};

describe('checkout service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkoutIntentFindUnique.mockResolvedValue(null);
    mocks.checkoutIntentCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (argument: unknown) => {
      if (typeof argument === 'function') {
        return (argument as (client: typeof mocks.tx) => Promise<unknown>)(mocks.tx);
      }
      return Promise.all(argument as Promise<unknown>[]);
    });
  });

  it('creates a server-owned pricing snapshot without creating a user', async () => {
    mocks.tx.checkoutIntent.create.mockImplementation(async ({ data }) => ({
      id: 'intent-1',
      orderId: data.orderId,
      status: 'PENDING',
      planCode: data.planCode,
      amount: data.amount,
      currency: data.currency,
      pricingSnapshot: data.pricingSnapshot,
      expiresAt: data.expiresAt,
    }));

    const result = await checkoutService.createIntent({
      email: ' USER@Example.com ',
      name: ' Анна ',
      planCode: 'START',
      consents,
      idempotencyKey: 'checkout-test-key-1234',
    });

    expect(result.intent.amount).toBe(7900);
    expect(result.intent.planCode).toBe('START');
    expect(mocks.tx.checkoutIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        name: 'Анна',
        amount: 7900,
        currency: 'RUB',
        pricingSnapshot: expect.objectContaining({
          priceRub: 7900,
          aiPoints: 5000,
          projectsLimit: 1,
        }),
      }),
    });
    expect(mocks.tx.consentLog.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing pending provider payment instead of creating another one', async () => {
    const sessionToken = 'session-token';
    const csrfToken = 'csrf-token';
    mocks.checkoutIntentFindUnique.mockResolvedValue({
      id: '5c6f6c46-8266-4c29-956e-3cd0df93f383',
      status: 'PAYMENT_CREATED',
      expiresAt: new Date(Date.now() + 60_000),
      sessionTokenHash: createHash('sha256').update(sessionToken).digest('hex'),
      csrfTokenHash: createHash('sha256').update(csrfToken).digest('hex'),
      planCode: 'START',
      amount: 7900,
      currency: 'RUB',
      paymentAttempts: [{
        id: 'attempt-1',
        status: 'PENDING',
        providerPaymentId: 'provider-1',
        confirmationUrl: 'https://yookassa.test/confirm',
      }],
    });

    const result = await checkoutService.createPayment({
      intentId: '5c6f6c46-8266-4c29-956e-3cd0df93f383',
      sessionToken,
      csrfToken,
      csrfCookie: csrfToken,
    });

    expect(result).toEqual({
      paymentId: 'provider-1',
      confirmationUrl: 'https://yookassa.test/confirm',
      reused: true,
    });
    expect(mocks.createProviderPayment).not.toHaveBeenCalled();
    expect(mocks.paymentAttemptCreate).not.toHaveBeenCalled();
  });
});
