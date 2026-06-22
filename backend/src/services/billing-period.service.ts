import { Subscription, SubscriptionPlan } from '@prisma/client';
import { PLAN_LIMITS } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { creditLedgerService } from './credit-ledger.service';

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export const billingPeriodService = {
  getPeriodBounds(now = new Date()): { periodStart: Date; periodEnd: Date } {
    return {
      periodStart: startOfUtcMonth(now),
      periodEnd: startOfNextUtcMonth(now),
    };
  },

  async getOrCreateCurrent(userId: string, subscription?: Subscription | null, now = new Date()) {
    const { periodStart, periodEnd } = billingPeriodService.getPeriodBounds(now);
    const planCode = (subscription?.plan ?? 'START') as SubscriptionPlan;

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
          return prisma.billingPeriod.update({
            where: { id: existing.id },
            data: {
              creditsGranted: amount,
              creditsRemainingSnapshot: amount,
            },
          });
        }
      }
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
    if (amount <= 0) return created;

    await creditLedgerService.grant({
      userId,
      amount,
      billingPeriodId: created.id,
      reason: `Monthly credits ${planCode}`,
      source: 'PLAN',
    });

    return prisma.billingPeriod.update({
      where: { id: created.id },
      data: {
        creditsGranted: amount,
        creditsRemainingSnapshot: amount,
      },
    });
  },

  async closeExpired(now = new Date()): Promise<number> {
    const result = await prisma.billingPeriod.updateMany({
      where: { status: 'OPEN', periodEnd: { lte: now } },
      data: { status: 'CLOSED' },
    });
    return result.count;
  },
};
