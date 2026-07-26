import { Subscription, SubscriptionPlan } from '@prisma/client';
import { PLAN_LIMITS } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { creditLedgerService } from './credit-ledger.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiPointLedgerService } from './ai-point-ledger.service';

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

async function ensureAiPointAccrual(period: {
  id: string;
  userId: string;
  planCode: string;
  periodEnd: Date;
  creditsGranted: number;
}): Promise<void> {
  if (!(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) return;
  const planCode = period.planCode as SubscriptionPlan;
  const amount = period.creditsGranted > 0
    ? period.creditsGranted
    : PLAN_LIMITS[planCode].monthlyCredits;
  await aiPointLedgerService.ensurePlanAccrual({
    userId: period.userId,
    billingPeriodId: period.id,
    amount,
    planCode,
    expiresAt: period.periodEnd,
  });
}

export const billingPeriodService = {
  getPeriodBounds(now = new Date()): { periodStart: Date; periodEnd: Date } {
    return {
      periodStart: startOfUtcMonth(now),
      periodEnd: startOfNextUtcMonth(now),
    };
  },

  async getOrCreateCurrent(userId: string, subscription?: Subscription | null, now = new Date()) {
    const subscriptionPeriodEnd = subscription?.status === 'ACTIVE'
      && subscription.expiresAt
      && subscription.expiresAt > now
      ? subscription.expiresAt
      : null;
    const { periodStart, periodEnd } = subscriptionPeriodEnd
      ? {
        periodStart: new Date(subscriptionPeriodEnd.getTime() - (30 * 24 * 60 * 60 * 1000)),
        periodEnd: subscriptionPeriodEnd,
      }
      : billingPeriodService.getPeriodBounds(now);
    const planCode = (subscription?.plan ?? 'FREE') as SubscriptionPlan;

    const existing = await prisma.billingPeriod.findFirst({
      where: {
        userId,
        status: 'OPEN',
        periodStart: { lte: now },
        periodEnd: { gt: now },
      },
      orderBy: { periodStart: 'desc' },
    });

    if (existing) {
      if (existing.creditsGranted <= 0) {
        const existingPlanCode = existing.planCode as SubscriptionPlan;
        const amount = PLAN_LIMITS[existingPlanCode].monthlyCredits;
        if (amount > 0) {
          await creditLedgerService.grant({
            userId,
            amount,
            billingPeriodId: existing.id,
            reason: `Monthly credits ${existing.planCode}`,
            source: 'PLAN',
          });
          const updated = await prisma.billingPeriod.update({
            where: { id: existing.id },
            data: {
              creditsGranted: amount,
              creditsRemainingSnapshot: amount,
            },
          });
          await ensureAiPointAccrual(updated);
          return updated;
        }
      }
      await ensureAiPointAccrual(existing);
      return existing;
    }

    const created = await prisma.billingPeriod.create({
      data: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planCode,
        periodStart,
        periodEnd,
      },
    });

    const amount = PLAN_LIMITS[planCode].monthlyCredits;
    if (amount <= 0) {
      await ensureAiPointAccrual(created);
      return created;
    }

    await creditLedgerService.grant({
      userId,
      amount,
      billingPeriodId: created.id,
      reason: `Monthly credits ${planCode}`,
      source: 'PLAN',
    });

    const updated = await prisma.billingPeriod.update({
      where: { id: created.id },
      data: {
        creditsGranted: amount,
        creditsRemainingSnapshot: amount,
      },
    });
    await ensureAiPointAccrual(updated);
    return updated;
  },

  async closeExpired(now = new Date()): Promise<number> {
    if (await aiFeatureFlagsService.isEnabled('AI_POINTS_V2')) {
      const periods = await prisma.billingPeriod.findMany({
        where: { status: 'OPEN', periodEnd: { lte: now } },
        select: { id: true, userId: true },
      });
      for (const period of periods) {
        await aiPointLedgerService.expirePeriod({
          userId: period.userId,
          billingPeriodId: period.id,
        });
      }
    }
    const result = await prisma.billingPeriod.updateMany({
      where: { status: 'OPEN', periodEnd: { lte: now } },
      data: { status: 'CLOSED' },
    });
    return result.count;
  },
};
