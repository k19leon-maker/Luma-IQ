import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentController } from '../../src/controllers/payment.controller';
import { paymentService } from '../../src/services/payment.service';

function responseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('payment controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose provider credentials errors to the user', async () => {
    vi.spyOn(paymentService, 'createPayment').mockRejectedValue(
      new Error('YooKassa error 401: invalid_credentials for shopId'),
    );
    const response = responseMock();

    await paymentController.createPayment(
      {
        userId: 'user-1',
        body: { plan: 'START' },
      } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Не удалось перейти к оплате. Попробуйте ещё раз через несколько минут.',
    });
  });

  it('keeps safe validation errors returned by the payment service', async () => {
    vi.spyOn(paymentService, 'createPayment').mockRejectedValue(
      Object.assign(new Error('Тариф недоступен для новой покупки'), { status: 400 }),
    );
    const response = responseMock();

    await paymentController.createPayment(
      {
        userId: 'user-1',
        body: { plan: 'START' },
      } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Тариф недоступен для новой покупки',
    });
  });
});
