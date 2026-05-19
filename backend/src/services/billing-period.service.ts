import { Subscription, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
    const planCode = subscription?.plan ?? 'FREE';

    const existing = await prisma.billingPeriod.findFirst({
      where: {
        userId,
        status: 'OPEN',
        periodStart: { lte: now },
        periodEnd: { gt: now },
      },
      orderBy: { periodStart: 'desc' },
    });

    if (existing) return existing;

    return prisma.billingPeriod.create({
      data: {
        userId,
        subscriptionId: subscription?.id ?? null,
        planCode: planCode as SubscriptionPlan,
        periodStart,
        periodEnd,
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
