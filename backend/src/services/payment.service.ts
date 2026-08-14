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
import { yookassaService } from './yookassa.service';

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

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

type YooKassaWebhookEvent = {
  type?: string;
  event?: string;
  object?: { id?: string };
};

function storedPlan(payment: { metadata: Prisma.JsonValue | null }): PublicPaidPlanId | null {
  const metadata = payment.metadata as Record<string, unknown> | null;
  const plan = metadata?.plan;
  return typeof plan === 'string' && isPurchasablePlanId(plan)
    ? resolvePlanId(plan) as PublicPaidPlanId
    : null;
}

function sameMoney(left: Prisma.Decimal | string | number, right: string): boolean {
  try {
    return new Prisma.Decimal(left).equals(new Prisma.Decimal(right));
  } catch {
    return false;
  }
}

async function recordRejectedWebhook(input: {
  paymentId?: string;
  userId?: string | null;
  eventType?: string;
  reason: string;
}): Promise<void> {
  await prisma.userEvent.create({
    data: {
      userId: input.userId ?? null,
      type: 'payment_webhook_rejected',
      metadata: {
        paymentId: input.paymentId ?? null,
        eventType: input.eventType ?? null,
        reason: input.reason,
      },
    },
  }).catch(() => undefined);
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
    const ykPayment = await yookassaService.createPayment({
      amount: planDef.amount,
      currency: 'RUB',
      description: planDef.description,
      returnUrl: env.YOOKASSA_RETURN_URL,
      metadata: { userId, plan, ...metadata } as Record<string, string | number>,
      idempotencyKey: uuidv4(),
    });

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
          metadata: { userId, plan, ...metadata } as Prisma.InputJsonValue,
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

  async handleWebhook(event: YooKassaWebhookEvent): Promise<void> {
    if (!env.YOOKASSA_ENABLED) {
      throw Object.assign(new Error('YooKassa webhook disabled'), { status: 404 });
    }
    const eventType = event.type ?? event.event;
    const rawPaymentId = event.object?.id?.trim();
    const yookassaId = rawPaymentId && /^[A-Za-z0-9_-]{1,128}$/.test(rawPaymentId)
      ? rawPaymentId
      : undefined;
    if (!yookassaId || (eventType !== 'payment.succeeded' && eventType !== 'payment.canceled')) {
      await recordRejectedWebhook({ paymentId: yookassaId, eventType, reason: 'unsupported_event' });
      return;
    }

    const localPayment = await prisma.payment.findUnique({ where: { yookassaId } });
    if (!localPayment) {
      await recordRejectedWebhook({ paymentId: yookassaId, eventType, reason: 'payment_not_found' });
      return;
    }
    const plan = storedPlan(localPayment);
    if (!plan) {
      await recordRejectedWebhook({ paymentId: yookassaId, userId: localPayment.userId, eventType, reason: 'invalid_stored_plan' });
      return;
    }

    const providerPayment = await yookassaService.getPayment(yookassaId);
    const providerMetadata = providerPayment.metadata ?? {};
    const paymentMatches = providerPayment.id === yookassaId
      && providerPayment.amount?.currency === localPayment.currency
      && sameMoney(localPayment.amount, providerPayment.amount?.value ?? '')
      && providerMetadata.userId === localPayment.userId
      && providerMetadata.plan === plan;
    if (!paymentMatches) {
      await recordRejectedWebhook({ paymentId: yookassaId, userId: localPayment.userId, eventType, reason: 'provider_payment_mismatch' });
      return;
    }

    if (providerPayment.status === 'canceled') {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { yookassaId } });
        if (!payment || payment.status !== 'PENDING') return;
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        if (!updated.count) return;
        await tx.userEvent.create({
          data: {
            userId: payment.userId,
            type: 'payment_cancelled',
            metadata: {
              paymentId: yookassaId,
              ...((payment.metadata as Record<string, unknown> | null) ?? {}),
            } as Prisma.InputJsonValue,
          },
        });
      });
      return;
    }

    if (providerPayment.status !== 'succeeded' || providerPayment.paid !== true) {
      await recordRejectedWebhook({ paymentId: yookassaId, userId: localPayment.userId, eventType, reason: 'provider_not_succeeded' });
      return;
    }

    const planDef = PLANS[plan];

    const activated = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { yookassaId } });
      if (!payment || payment.status !== 'PENDING') return false;

      const now = new Date();
      const expiresAt = addDays(now, planDef.periodDays);
      const previousSubscription = await tx.subscription.findUnique({ where: { userId: payment.userId } });
      const previousPlan = previousSubscription
        ? getPlanBySubscriptionPlan(previousSubscription.plan)
        : null;
      const nextPlan = PRICING_PLANS[plan];
      const transitionEvent = previousPlan?.id === nextPlan.id
        ? 'plan_renewed'
        : previousPlan && previousPlan.priceMonthlyRub > 0
          ? previousPlan.priceMonthlyRub < nextPlan.priceMonthlyRub ? 'plan_upgraded' : 'plan_downgraded'
          : null;

      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
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
      if (!updated.count) return false;
      await tx.subscription.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
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
        where: { userId: payment.userId, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      await tx.userEvent.create({
        data: {
          userId: payment.userId,
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
            userId: payment.userId,
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
      return true;
    });

    if (!activated) return;

    // The existing period/ledger layer owns idempotent PLAN_ACCRUAL creation.
    const subscription = await prisma.subscription.findUnique({ where: { userId: localPayment.userId } });
    await billingPeriodService.getOrCreateCurrent(localPayment.userId, subscription);
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
