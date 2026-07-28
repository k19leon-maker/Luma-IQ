import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import {
  PRICING_PLANS,
  PublicPaidPlanId,
  isPurchasablePlanId,
  resolvePlanId,
} from '../config/pricing-plans';
import { planCatalogService } from './plan-catalog.service';
import { yookassaService } from './yookassa.service';
import type { LegalConsentInput } from './consent-log.service';

export const CHECKOUT_SESSION_COOKIE = 'luma_checkout';
export const CHECKOUT_CSRF_COOKIE = 'luma_checkout_csrf';

const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_INTENTS_PER_EMAIL_WINDOW = 5;

type CheckoutAttribution = Partial<Record<
  'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term',
  string
>>;

export type CreateCheckoutIntentInput = {
  email: string;
  name?: string;
  planCode: string;
  consents: LegalConsentInput;
  attribution?: CheckoutAttribution;
  anonymousSessionId?: string;
  landingPath?: string;
  referrer?: string;
  idempotencyKey: string;
  ip?: string | null;
  userAgent?: string | null;
};

type CheckoutSession = {
  sessionToken: string;
  csrfToken: string;
  maxAgeMs: number;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secureToken(): string {
  return randomBytes(32).toString('base64url');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function safeHashEquals(rawValue: string, expectedHash: string): boolean {
  const actual = Buffer.from(hash(rawValue));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function planSnapshot(plan: PublicPaidPlanId) {
  const definition = PRICING_PLANS[plan];
  return {
    planCode: definition.id,
    planName: definition.name,
    priceRub: definition.priceMonthlyRub,
    currency: definition.currency,
    periodDays: definition.periodDays,
    aiPoints: definition.limits.monthlyCredits,
    projectsLimit: definition.limits.projectsLimit,
  };
}

function createSession(): CheckoutSession & { sessionTokenHash: string; csrfTokenHash: string } {
  const sessionToken = secureToken();
  const csrfToken = secureToken();
  return {
    sessionToken,
    csrfToken,
    sessionTokenHash: hash(sessionToken),
    csrfTokenHash: hash(csrfToken),
    maxAgeMs: env.CHECKOUT_INTENT_TTL_HOURS * 60 * 60 * 1000,
  };
}

function publicIntent(intent: {
  id: string;
  orderId: string;
  status: string;
  planCode: string;
  amount: Prisma.Decimal;
  currency: string;
  pricingSnapshot: Prisma.JsonValue;
  expiresAt: Date;
}) {
  return {
    id: intent.id,
    orderId: intent.orderId,
    status: intent.status.toLowerCase(),
    planCode: intent.planCode,
    amount: Number(intent.amount),
    currency: intent.currency,
    pricing: intent.pricingSnapshot,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

export const checkoutService = {
  async createIntent(input: CreateCheckoutIntentInput) {
    const email = normalizeEmail(input.email);
    const emailHash = hash(email);
    if (!isPurchasablePlanId(input.planCode)) {
      throw Object.assign(new Error('Тариф недоступен для покупки'), {
        status: 400,
        code: 'INVALID_PLAN',
      });
    }
    const plan = resolvePlanId(input.planCode) as PublicPaidPlanId;
    if (!(await planCatalogService.isPurchasable(plan))) {
      throw Object.assign(new Error('Новые покупки этого тарифа временно недоступны'), {
        status: 400,
        code: 'PLAN_NOT_PURCHASABLE',
      });
    }

    const existing = await prisma.checkoutIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.emailHash !== emailHash || existing.planCode !== plan) {
        throw Object.assign(new Error('Ключ повторной отправки уже использован'), {
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      const session = createSession();
      const refreshed = await prisma.checkoutIntent.update({
        where: { id: existing.id },
        data: {
          sessionTokenHash: session.sessionTokenHash,
          csrfTokenHash: session.csrfTokenHash,
        },
      });
      return {
        intent: publicIntent(refreshed),
        csrfToken: session.csrfToken,
        session,
        reused: true,
      };
    }

    const recentIntentCount = await prisma.checkoutIntent.count({
      where: {
        emailHash,
        createdAt: { gte: new Date(Date.now() - EMAIL_WINDOW_MS) },
      },
    });
    if (recentIntentCount >= MAX_INTENTS_PER_EMAIL_WINDOW) {
      throw Object.assign(new Error('Слишком много попыток оформления. Попробуйте через 15 минут.'), {
        status: 429,
        code: 'CHECKOUT_EMAIL_RATE_LIMIT',
      });
    }

    const definition = PRICING_PLANS[plan];
    const pricingSnapshot = planSnapshot(plan);
    const session = createSession();
    const consentAcceptedAt = new Date();
    const expiresAt = new Date(consentAcceptedAt.getTime() + session.maxAgeMs);

    const intent = await prisma.$transaction(async (tx) => {
      const created = await tx.checkoutIntent.create({
        data: {
          orderId: `LUMA-${uuidv4()}`,
          sessionTokenHash: session.sessionTokenHash,
          csrfTokenHash: session.csrfTokenHash,
          idempotencyKey: input.idempotencyKey,
          email,
          emailHash,
          name: input.name?.trim() || null,
          planCode: plan,
          amount: definition.priceMonthlyRub,
          currency: definition.currency,
          pricingSnapshot: pricingSnapshot as Prisma.InputJsonValue,
          consentSnapshot: input.consents as Prisma.InputJsonValue,
          legalDocumentVersion: input.consents.documentVersion,
          consentAcceptedAt,
          attribution: input.attribution as Prisma.InputJsonValue | undefined,
          anonymousSessionId: input.anonymousSessionId || null,
          landingPath: input.landingPath || null,
          referrer: input.referrer || null,
          expiresAt,
        },
      });
      await tx.consentLog.create({
        data: {
          email,
          ip: input.ip || null,
          userAgent: input.userAgent || null,
          privacyAccepted: input.consents.privacyAccepted,
          personalDataAccepted: input.consents.personalDataAccepted,
          offerAccepted: input.consents.offerAccepted,
          documentVersion: input.consents.documentVersion,
          source: 'b2b_checkout',
          acceptedAt: consentAcceptedAt,
        },
      });
      return created;
    });

    return {
      intent: publicIntent(intent),
      csrfToken: session.csrfToken,
      session,
      reused: false,
    };
  },

  async createPayment(input: {
    intentId: string;
    sessionToken?: string;
    csrfToken?: string;
    csrfCookie?: string;
  }) {
    if (!input.sessionToken || !input.csrfToken || !input.csrfCookie) {
      throw Object.assign(new Error('Checkout-сессия недействительна'), {
        status: 403,
        code: 'CHECKOUT_SESSION_INVALID',
      });
    }
    if (input.csrfToken !== input.csrfCookie) {
      throw Object.assign(new Error('Не удалось подтвердить checkout-сессию'), {
        status: 403,
        code: 'CHECKOUT_CSRF_INVALID',
      });
    }

    const intent = await prisma.checkoutIntent.findUnique({
      where: { id: input.intentId },
      include: {
        paymentAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (
      !intent
      || !safeHashEquals(input.sessionToken, intent.sessionTokenHash)
      || !safeHashEquals(input.csrfToken, intent.csrfTokenHash)
    ) {
      throw Object.assign(new Error('Checkout-сессия недействительна'), {
        status: 403,
        code: 'CHECKOUT_SESSION_INVALID',
      });
    }
    if (intent.expiresAt <= new Date()) {
      if (!['PAID', 'ACCOUNT_CREATED', 'ACCOUNT_LINK_PENDING'].includes(intent.status)) {
        await prisma.checkoutIntent.update({
          where: { id: intent.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw Object.assign(new Error('Срок оформления истёк. Выберите тариф ещё раз.'), {
        status: 410,
        code: 'CHECKOUT_EXPIRED',
      });
    }
    if (!['PENDING', 'PAYMENT_CREATED'].includes(intent.status)) {
      throw Object.assign(new Error('Для этого заказа нельзя создать новый платёж'), {
        status: 409,
        code: 'CHECKOUT_STATE_CONFLICT',
      });
    }
    if (!isPurchasablePlanId(intent.planCode)) {
      throw Object.assign(new Error('Тариф недоступен для покупки'), {
        status: 400,
        code: 'INVALID_PLAN',
      });
    }
    const plan = resolvePlanId(intent.planCode) as PublicPaidPlanId;
    if (!(await planCatalogService.isPurchasable(plan))) {
      throw Object.assign(new Error('Новые покупки этого тарифа временно недоступны'), {
        status: 400,
        code: 'PLAN_NOT_PURCHASABLE',
      });
    }

    const definition = PRICING_PLANS[plan];
    if (Number(intent.amount) !== definition.priceMonthlyRub || intent.currency !== definition.currency) {
      throw Object.assign(new Error('Стоимость тарифа изменилась. Выберите тариф ещё раз.'), {
        status: 409,
        code: 'CHECKOUT_PRICE_CHANGED',
      });
    }

    const latestAttempt = intent.paymentAttempts[0];
    if (latestAttempt?.status === 'PENDING' && latestAttempt.confirmationUrl) {
      return {
        paymentId: latestAttempt.providerPaymentId,
        confirmationUrl: latestAttempt.confirmationUrl,
        reused: true,
      };
    }

    const attempt = latestAttempt && ['CREATED', 'UNKNOWN'].includes(latestAttempt.status)
      ? latestAttempt
      : await prisma.checkoutPaymentAttempt.create({
        data: {
          checkoutIntentId: intent.id,
          providerIdempotencyKey: uuidv4(),
          amount: intent.amount,
          currency: intent.currency,
          metadata: {
            orderId: intent.orderId,
            planCode: plan,
          },
        },
      });

    try {
      const providerPayment = await yookassaService.createPayment({
        amount: Number(intent.amount).toFixed(2),
        currency: 'RUB',
        description: `Luma IQ ${definition.name} — ${definition.periodDays} дней`,
        returnUrl: env.CHECKOUT_RETURN_URL,
        metadata: {
          checkoutIntentId: intent.id,
          orderId: intent.orderId,
          planCode: plan,
          emailHash: intent.emailHash,
        },
        idempotencyKey: attempt.providerIdempotencyKey,
      });

      await prisma.$transaction([
        prisma.checkoutPaymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'PENDING',
            providerPaymentId: providerPayment.id,
            providerStatus: providerPayment.status,
            confirmationUrl: providerPayment.confirmation.confirmation_url,
            errorCode: null,
          },
        }),
        prisma.checkoutIntent.update({
          where: { id: intent.id },
          data: { status: 'PAYMENT_CREATED', failureCode: null, failureMessage: null },
        }),
      ]);

      return {
        paymentId: providerPayment.id,
        confirmationUrl: providerPayment.confirmation.confirmation_url,
        reused: false,
      };
    } catch (error) {
      const providerError = error as Error & { code?: string };
      await prisma.$transaction([
        prisma.checkoutPaymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'UNKNOWN',
            errorCode: providerError.code ?? 'PAYMENT_PROVIDER_ERROR',
          },
        }),
        prisma.checkoutIntent.update({
          where: { id: intent.id },
          data: {
            status: 'PENDING',
            failureCode: providerError.code ?? 'PAYMENT_PROVIDER_ERROR',
            failureMessage: 'Не удалось создать платёж',
          },
        }),
      ]).catch(() => undefined);
      throw error;
    }
  },
};
