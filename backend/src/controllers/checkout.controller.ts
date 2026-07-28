import { Request, Response } from 'express';
import { z } from 'zod';
import { checkoutService, CHECKOUT_CSRF_COOKIE, CHECKOUT_SESSION_COOKIE } from '../services/checkout.service';
import { legalConsentSchema } from '../services/consent-log.service';
import { isPurchasablePlanId } from '../config/pricing-plans';
import { env } from '../config/env';

const attributionSchema = z.object({
  utm_source: z.string().trim().max(200).optional(),
  utm_medium: z.string().trim().max(200).optional(),
  utm_campaign: z.string().trim().max(200).optional(),
  utm_content: z.string().trim().max(200).optional(),
  utm_term: z.string().trim().max(200).optional(),
}).strict();

const createIntentSchema = z.object({
  email: z.string().trim().email('Введите корректный email').max(320),
  name: z.string().trim().min(1).max(120).optional(),
  planCode: z.string().refine(isPurchasablePlanId, 'Тариф недоступен для покупки'),
  consents: legalConsentSchema,
  attribution: attributionSchema.optional(),
  anonymousSessionId: z.string().trim().max(128).optional(),
  landingPath: z.string().trim().max(300).optional(),
  referrer: z.string().trim().max(500).optional(),
});

const intentParamsSchema = z.object({
  intentId: z.string().uuid('Некорректный checkout intent'),
});

function clientIp(req: Request): string | null {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
    || req.headers['x-real-ip']?.toString()
    || req.ip
    || null
  );
}

function publicCheckoutError(error: unknown) {
  const checkoutError = error as Error & { status?: number; code?: string };
  const status = checkoutError.status && checkoutError.status >= 400 && checkoutError.status < 600
    ? checkoutError.status
    : 500;
  return {
    status,
    body: {
      error: status >= 500
        ? 'Не удалось начать оформление. Попробуйте ещё раз через несколько минут.'
        : checkoutError.message,
      code: checkoutError.code ?? 'CHECKOUT_ERROR',
    },
  };
}

function setCheckoutCookies(res: Response, session: {
  sessionToken: string;
  csrfToken: string;
  maxAgeMs: number;
}) {
  const common = {
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/v1/checkout',
    maxAge: session.maxAgeMs,
  };
  res.cookie(CHECKOUT_SESSION_COOKIE, session.sessionToken, {
    ...common,
    httpOnly: true,
  });
  res.cookie(CHECKOUT_CSRF_COOKIE, session.csrfToken, {
    ...common,
    httpOnly: false,
  });
}

export const checkoutController = {
  async createIntent(req: Request, res: Response): Promise<void> {
    const parsed = createIntentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.errors[0]?.message ?? 'Проверьте данные формы',
        code: 'CHECKOUT_VALIDATION_ERROR',
      });
      return;
    }
    const idempotencyKey = req.headers['idempotency-key']?.toString().trim();
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      res.status(400).json({
        error: 'Не удалось подтвердить отправку формы. Обновите страницу и попробуйте ещё раз.',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
      return;
    }

    try {
      const result = await checkoutService.createIntent({
        ...parsed.data,
        idempotencyKey,
        ip: clientIp(req),
        userAgent: req.headers['user-agent']?.toString() ?? null,
      });
      setCheckoutCookies(res, result.session);
      res.status(result.reused ? 200 : 201).json({
        intent: result.intent,
        csrfToken: result.csrfToken,
        reused: result.reused,
      });
    } catch (error) {
      const response = publicCheckoutError(error);
      res.status(response.status).json(response.body);
    }
  },

  async createPayment(req: Request, res: Response): Promise<void> {
    const parsed = intentParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.errors[0]?.message ?? 'Некорректный checkout intent',
        code: 'CHECKOUT_VALIDATION_ERROR',
      });
      return;
    }
    try {
      const result = await checkoutService.createPayment({
        intentId: parsed.data.intentId,
        sessionToken: req.cookies?.[CHECKOUT_SESSION_COOKIE],
        csrfCookie: req.cookies?.[CHECKOUT_CSRF_COOKIE],
        csrfToken: req.headers['x-checkout-csrf']?.toString(),
      });
      res.json(result);
    } catch (error) {
      const response = publicCheckoutError(error);
      res.status(response.status).json(response.body);
    }
  },
};
