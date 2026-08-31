import { Prisma, Subscription, SubscriptionPlan } from '@prisma/client';
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

const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function subscriptionPeriodBounds(expiresAt: Date, now: Date): {
  periodStart: Date;
  periodEnd: Date;
} {
  let periodEnd = new Date(expiresAt);
  let periodStart = new Date(periodEnd.getTime() - SUBSCRIPTION_PERIOD_MS);

  while (periodStart > now) {
    periodEnd = periodStart;
    periodStart = new Date(periodEnd.getTime() - SUBSCRIPTION_PERIOD_MS);
  }

  return { periodStart, periodEnd };
}

async function findOrCreatePeriod(input: {
  userId: string;
  subscription?: Subscription | null;
  planCode: SubscriptionPlan;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(816272, hashtext(${`${input.userId}:billing-period`}))`;
    const existing = await tx.billingPeriod.findFirst({
      where: {
        userId: input.userId,
        status: 'OPEN',
        periodStart: { lte: input.now },
        periodEnd: { gt: input.now },
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'asc' }],
    });
    if (existing) return existing;

    return tx.billingPeriod.create({
      data: {
        userId: input.userId,
        subscriptionId: input.subscription?.id ?? null,
        planCode: input.planCode,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
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
      ? subscriptionPeriodBounds(subscriptionPeriodEnd, now)
      : billingPeriodService.getPeriodBounds(now);
    const planCode = (subscription?.plan ?? 'FREE') as SubscriptionPlan;
    const period = await findOrCreatePeriod({
      userId,
      subscription,
      planCode,
      periodStart,
      periodEnd,
      now,
    });

    if (period.creditsGranted > 0) {
      await ensureAiPointAccrual(period);
      return period;
    }

    const periodPlanCode = period.planCode as SubscriptionPlan;
    const amount = PLAN_LIMITS[periodPlanCode].monthlyCredits;
    if (amount <= 0) {
      await ensureAiPointAccrual(period);
      return period;
    }

    const claimed = await prisma.billingPeriod.updateMany({
      where: { id: period.id, creditsGranted: { lte: 0 } },
      data: {
        creditsGranted: amount,
        creditsRemainingSnapshot: amount,
      },
    });

    if (claimed.count && !(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) {
      await creditLedgerService.grant({
        userId,
        amount,
        billingPeriodId: period.id,
        reason: `Monthly credits ${periodPlanCode}`,
        source: 'PLAN',
      });
    }

    const updated = await prisma.billingPeriod.findUniqueOrThrow({ where: { id: period.id } });
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
