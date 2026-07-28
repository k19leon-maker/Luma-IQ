import { env } from '../config/env';

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

type YooKassaErrorPayload = {
  id?: string;
  code?: string;
  description?: string;
};

export type CreateYooKassaPaymentInput = {
  amount: string;
  currency: 'RUB';
  description: string;
  returnUrl: string;
  metadata: Record<string, string | number>;
  idempotencyKey: string;
};

export type YooKassaPayment = {
  id: string;
  status: string;
  confirmation: {
    confirmation_url: string;
  };
};

async function request(
  method: string,
  path: string,
  idempotencyKey: string,
  body?: unknown,
): Promise<unknown> {
  if (!env.YOOKASSA_ENABLED) {
    throw Object.assign(
      new Error('Онлайн-оплата временно отключена. Для пилотного доступа напишите администратору.'),
      { status: 503, code: 'PAYMENT_DISABLED' },
    );
  }
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
    throw Object.assign(new Error('Оплата временно недоступна'), {
      status: 503,
      code: 'PAYMENT_NOT_CONFIGURED',
    });
  }

  const credentials = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  const response = await fetch(`${YOOKASSA_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotencyKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const raw = await response.text();
    let providerError: YooKassaErrorPayload = {};
    try {
      providerError = JSON.parse(raw) as YooKassaErrorPayload;
    } catch {
      // Do not expose or persist malformed provider responses.
    }
    console.error('[Payment] YooKassa request failed', {
      method,
      path,
      status: response.status,
      requestId: providerError.id,
      code: providerError.code,
      description: providerError.description,
    });
    throw Object.assign(new Error('Сервис оплаты временно недоступен'), {
      status: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  }

  return response.json();
}

export const yookassaService = {
  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPayment> {
    return request('POST', '/payments', input.idempotencyKey, {
      amount: { value: input.amount, currency: input.currency },
      confirmation: { type: 'redirect', return_url: input.returnUrl },
      capture: true,
      description: input.description,
      metadata: input.metadata,
    }) as Promise<YooKassaPayment>;
  },
};
