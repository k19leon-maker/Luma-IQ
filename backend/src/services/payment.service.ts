import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import {
  PRICING_PLANS,
  PublicPaidPlanId,
  getPlanBySubscriptionPlan,
  isPurchasablePlanId,
  resolvePlanId,
  toSubscriptionPlan,
} from '../config/pricing-plans';
import { billingPeriodService } from './billing-period.service';
import { planCatalogService } from './plan-catalog.service';

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

function paymentDefinition(planId: PublicPaidPlanId) {
  const plan = PRICING_PLANS[planId];
  return {
    amount: `${plan.priceMonthlyRub.toFixed(2)}`,
    description: `Luma IQ ${plan.name} — 30 дней`,
    periodDays: plan.periodDays,
  };
}

export const PLANS = {
  START: paymentDefinition('START'),
  SYSTEM_FUNNEL: paymentDefinition('SYSTEM_FUNNEL'),
  EVERGREEN_FUNNEL: paymentDefinition('EVERGREEN_FUNNEL'),
} as const;

type PlanPaymentDefinition = { amount: string; description: string; periodDays: number };

async function ykRequest(method: string, path: string, body?: unknown) {
  const credentials = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  const response = await fetch(`${YOOKASSA_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': uuidv4(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const raw = await response.text();
    let providerError: { id?: string; code?: string; description?: string } = {};
    try {
      providerError = JSON.parse(raw) as typeof providerError;
    } catch {
      // Keep malformed provider responses out of user-facing errors.
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

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export const paymentService = {
  async createPayment(userId: string, requestedPlan: string): Promise<{ confirmationUrl: string; paymentId: string }> {
    if (!isPurchasablePlanId(requestedPlan)) {
      throw Object.assign(new Error('Тариф недоступен для новой покупки'), { status: 400 });
    }
    const plan = resolvePlanId(requestedPlan) as PublicPaidPlanId;
    if (!(await planCatalogService.isPurchasable(plan))) {
      throw Object.assign(new Error('Новые покупки этого тарифа временно недоступны'), { status: 400 });
    }
    const analytics = {
      planCode: plan,
      planName: PRICING_PLANS[plan].name,
      priceRub: PRICING_PLANS[plan].priceMonthlyRub,
      aiPoints: PRICING_PLANS[plan].limits.monthlyCredits,
      activeProjectsLimit: PRICING_PLANS[plan].limits.projectsLimit,
    };
    try {
      return await this.createPaymentWithDefinition(userId, plan, PLANS[plan], analytics);
    } catch (error) {
      await prisma.userEvent.create({
        data: {
          userId,
          type: 'payment_failed',
          metadata: {
            ...analytics,
            error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown payment error',
          },
        },
      }).catch(() => undefined);
      throw error;
    }
  },

  async createPaymentWithDefinition(
    userId: string,
    plan: PublicPaidPlanId,
    planDef: PlanPaymentDefinition,
    metadata: Record<string, unknown>,
  ): Promise<{ confirmationUrl: string; paymentId: string }> {
    if (!env.YOOKASSA_ENABLED) {
      throw Object.assign(new Error('Онлайн-оплата временно отключена. Для пилотного доступа напишите администратору.'), { status: 503 });
    }
    if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
      throw Object.assign(new Error('Оплата временно недоступна'), { status: 503 });
    }

    const ykPayment = await ykRequest('POST', '/payments', {
      amount: { value: planDef.amount, currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: env.YOOKASSA_RETURN_URL },
      capture: true,
      description: planDef.description,
      metadata: { userId, plan, ...metadata },
    }) as { id: string; confirmation: { confirmation_url: string } };

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: 'FREE', status: 'ACTIVE' },
      update: {},
    });

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          yookassaId: ykPayment.id,
          amount: planDef.amount,
          status: 'PENDING',
          metadata: { plan, ...metadata } as Prisma.InputJsonValue,
        },
      }),
      prisma.userEvent.create({
        data: {
          userId,
          type: 'payment_started',
          metadata: {
            paymentId: ykPayment.id,
            ...metadata,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);

    return { paymentId: ykPayment.id, confirmationUrl: ykPayment.confirmation.confirmation_url };
  },

  async handleWebhook(event: {
    type?: string;
    event?: string;
    object: { id: string; status: string; metadata?: { userId?: string; plan?: string } };
  }): Promise<void> {
    if (!env.YOOKASSA_ENABLED) {
      throw Object.assign(new Error('YooKassa webhook disabled'), { status: 404 });
    }
    const eventType = event.type ?? event.event;
    if (eventType === 'payment.canceled') {
      const payment = await prisma.payment.findUnique({ where: { yookassaId: event.object.id } });
      if (payment && payment.status === 'PENDING') {
        await prisma.$transaction([
          prisma.payment.update({ where: { yookassaId: event.object.id }, data: { status: 'CANCELLED' } }),
          prisma.userEvent.create({
            data: {
              userId: payment.userId,
              type: 'payment_cancelled',
              metadata: {
                paymentId: event.object.id,
                ...((payment.metadata as Record<string, unknown> | null) ?? {}),
              } as Prisma.InputJsonValue,
            },
          }),
        ]);
      }
      return;
    }
    if (eventType !== 'payment.succeeded') return;

    const { id: yookassaId, metadata } = event.object;
    if (!metadata?.userId || !metadata.plan || !isPurchasablePlanId(metadata.plan)) return;
    const plan = resolvePlanId(metadata.plan) as PublicPaidPlanId;
    const planDef = PLANS[plan];

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { yookassaId } });
      if (!payment || payment.status === 'SUCCEEDED') return;

      const now = new Date();
      const expiresAt = addDays(now, planDef.periodDays);
      const previousSubscription = await tx.subscription.findUnique({ where: { userId: metadata.userId! } });
      const previousPlan = previousSubscription
        ? getPlanBySubscriptionPlan(previousSubscription.plan)
        : null;
      const nextPlan = PRICING_PLANS[plan];
      const transitionEvent = previousPlan?.id === nextPlan.id
        ? 'plan_renewed'
        : previousPlan && previousPlan.priceMonthlyRub > 0
          ? previousPlan.priceMonthlyRub < nextPlan.priceMonthlyRub ? 'plan_upgraded' : 'plan_downgraded'
          : null;

      await tx.payment.update({
        where: { yookassaId },
        data: {
          status: 'SUCCEEDED',
          metadata: {
            ...((payment.metadata as Record<string, unknown> | null) ?? {}),
            plan,
            planName: PRICING_PLANS[plan].name,
            aiPoints: PRICING_PLANS[plan].limits.monthlyCredits,
            activeProjectsLimit: PRICING_PLANS[plan].limits.projectsLimit,
          },
        },
      });
      await tx.subscription.upsert({
        where: { userId: metadata.userId! },
        create: {
          userId: metadata.userId!,
          plan: toSubscriptionPlan(plan),
          status: 'ACTIVE',
          expiresAt,
          yookassaId,
          lastPaymentAt: now,
        },
        update: {
          plan: toSubscriptionPlan(plan),
          status: 'ACTIVE',
          expiresAt,
          yookassaId,
          lastPaymentAt: now,
        },
      });
      await tx.billingPeriod.updateMany({
        where: { userId: metadata.userId!, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      await tx.userEvent.create({
        data: {
          userId: metadata.userId!,
          type: 'payment_succeeded',
          metadata: {
            paymentId: yookassaId,
            planCode: plan,
            planName: PRICING_PLANS[plan].name,
            priceRub: PRICING_PLANS[plan].priceMonthlyRub,
            aiPoints: PRICING_PLANS[plan].limits.monthlyCredits,
            activeProjectsLimit: PRICING_PLANS[plan].limits.projectsLimit,
          },
        },
      });
      if (transitionEvent) {
        await tx.userEvent.create({
          data: {
            userId: metadata.userId!,
            type: transitionEvent,
            metadata: {
              paymentId: yookassaId,
              previousPlanCode: previousPlan?.id,
              planCode: plan,
              planName: nextPlan.name,
              priceRub: nextPlan.priceMonthlyRub,
              aiPoints: nextPlan.limits.monthlyCredits,
              activeProjectsLimit: nextPlan.limits.projectsLimit,
            },
          },
        });
      }
    });

    // The existing period/ledger layer owns idempotent PLAN_ACCRUAL creation.
    const subscription = await prisma.subscription.findUnique({ where: { userId: metadata.userId } });
    await billingPeriodService.getOrCreateCurrent(metadata.userId, subscription);
  },

  async getSubscription(userId: string) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return { plan: 'FREE', status: 'ACTIVE', expiresAt: null };
    if (sub.expiresAt && sub.expiresAt < new Date() && sub.status === 'ACTIVE') {
      await prisma.subscription.update({ where: { userId }, data: { status: 'EXPIRED' } });
      return { plan: sub.plan, status: 'EXPIRED', expiresAt: sub.expiresAt };
    }
    return { plan: sub.plan, status: sub.status, expiresAt: sub.expiresAt };
  },
};
