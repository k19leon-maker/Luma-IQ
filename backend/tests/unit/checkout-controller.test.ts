import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutController } from '../../src/controllers/checkout.controller';
import { checkoutService } from '../../src/services/checkout.service';

function responseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('checkout controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes only validated checkout data and ignores a client-provided price', async () => {
    const createIntent = vi.spyOn(checkoutService, 'createIntent').mockResolvedValue({
      intent: {
        id: 'intent-1',
        orderId: 'order-1',
        status: 'pending',
        planCode: 'START',
        amount: 7900,
        currency: 'RUB',
        pricing: {},
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      csrfToken: 'csrf-token',
      session: {
        sessionToken: 'session-token',
        csrfToken: 'csrf-token',
        maxAgeMs: 60_000,
      },
      reused: false,
    });
    const response = responseMock();

    await checkoutController.createIntent(
      {
        body: {
          email: 'USER@example.com',
          name: 'Анна',
          planCode: 'START',
          amount: 1,
          currency: 'USD',
          consents: {
            privacyAccepted: true,
            personalDataAccepted: true,
            offerAccepted: true,
            documentVersion: 'v1',
          },
        },
        headers: {
          'idempotency-key': 'checkout-test-key-1234',
          'user-agent': 'vitest',
        },
        ip: '127.0.0.1',
      } as never,
      response as never,
    );

    expect(createIntent).toHaveBeenCalledWith(expect.not.objectContaining({
      amount: expect.anything(),
      currency: expect.anything(),
    }));
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing idempotency key before creating an intent', async () => {
    const createIntent = vi.spyOn(checkoutService, 'createIntent');
    const response = responseMock();

    await checkoutController.createIntent(
      {
        body: {
          email: 'user@example.com',
          planCode: 'START',
          consents: {
            privacyAccepted: true,
            personalDataAccepted: true,
            offerAccepted: true,
            documentVersion: 'v1',
          },
        },
        headers: {},
      } as never,
      response as never,
    );

    expect(createIntent).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    }));
  });
});
