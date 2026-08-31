const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const apply = process.argv.includes('--apply');
const nowArg = process.argv.find((arg) => arg.startsWith('--now='));
const now = nowArg ? new Date(nowArg.slice('--now='.length)) : new Date();
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

if (Number.isNaN(now.getTime())) throw new Error('Invalid --now value');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function cycleBounds(expiresAt) {
  let periodEnd = new Date(expiresAt);
  let periodStart = new Date(periodEnd.getTime() - PERIOD_MS);
  while (periodStart > now) {
    periodEnd = periodStart;
    periodStart = new Date(periodEnd.getTime() - PERIOD_MS);
  }
  return { periodStart, periodEnd };
}

async function latestState(userId, billingPeriodId, unit) {
  const latest = await prisma.creditLedgerEntry.findFirst({
    where: { userId, billingPeriodId, unit },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return latest
    ? {
      balance: latest.balanceAfter,
      reserved: latest.reservedAfter,
      available: latest.availableAfter,
    }
    : { balance: 0, reserved: 0, available: 0 };
}

async function repairSubscription(subscription) {
  const bounds = cycleBounds(subscription.expiresAt);
  const futurePeriods = await prisma.billingPeriod.findMany({
    where: {
      userId: subscription.userId,
      status: 'OPEN',
      periodStart: { gt: now },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!futurePeriods.length) return null;

  const sourceIds = futurePeriods.map((period) => period.id);
  const generations = await prisma.aIGeneration.findMany({
    where: {
      userId: subscription.userId,
      billingPeriodId: { in: sourceIds },
      createdAt: { gte: bounds.periodStart, lt: bounds.periodEnd },
    },
    select: { id: true },
  });
  const generationIds = generations.map((generation) => generation.id);
  const captures = generationIds.length
    ? await prisma.creditLedgerEntry.findMany({
      where: {
        userId: subscription.userId,
        generationId: { in: generationIds },
        unit: 'AI_POINT',
        type: { in: ['CAPTURE', 'REFUND'] },
      },
      select: { type: true, quantity: true },
    })
    : [];
  const captured = captures
    .filter((entry) => entry.type === 'CAPTURE')
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const refunded = captures
    .filter((entry) => entry.type === 'REFUND')
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const legacyPlanGrants = await prisma.creditLedgerEntry.aggregate({
    where: {
      userId: subscription.userId,
      billingPeriodId: { in: sourceIds },
      unit: 'LEGACY_CREDIT',
      source: 'PLAN',
      amount: { gt: 0 },
    },
    _sum: { amount: true },
  });

  const summary = {
    userId: subscription.userId,
    futurePeriods: futurePeriods.length,
    generations: generationIds.length,
    captured,
    refunded,
    legacyPlanGrants: legacyPlanGrants._sum.amount ?? 0,
    targetPeriodStart: bounds.periodStart.toISOString(),
    targetPeriodEnd: bounds.periodEnd.toISOString(),
  };
  if (!apply) return summary;

  const { billingPeriodService } = require('../dist/services/billing-period.service');
  const currentPeriod = await billingPeriodService.getOrCreateCurrent(
    subscription.userId,
    subscription,
    now,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(816273, hashtext(${`${subscription.userId}:billing-period-repair`}))`;
    if (generationIds.length) {
      await tx.aIGeneration.updateMany({
        where: { id: { in: generationIds } },
        data: { billingPeriodId: currentPeriod.id },
      });
      await tx.creditLedgerEntry.updateMany({
        where: {
          userId: subscription.userId,
          generationId: { in: generationIds },
          unit: 'AI_POINT',
        },
        data: { billingPeriodId: currentPeriod.id },
      });
    }
    await tx.billingPeriod.updateMany({
      where: { id: { in: sourceIds } },
      data: { status: 'CLOSED' },
    });
  });

  const lifecycle = generationIds.length
    ? await prisma.creditLedgerEntry.findMany({
      where: {
        userId: subscription.userId,
        billingPeriodId: currentPeriod.id,
        generationId: { in: generationIds },
        unit: 'AI_POINT',
        type: { in: ['RESERVE', 'CAPTURE', 'RELEASE'] },
      },
      select: { generationId: true, type: true, quantity: true },
    })
    : [];
  const settled = new Set(lifecycle
    .filter((entry) => entry.type === 'CAPTURE' || entry.type === 'RELEASE')
    .map((entry) => entry.generationId));
  const reserved = lifecycle
    .filter((entry) => entry.type === 'RESERVE' && !settled.has(entry.generationId))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const balance = Math.max(0, currentPeriod.creditsGranted - captured + refunded);
  const available = Math.max(0, balance - reserved);
  const aiState = await latestState(subscription.userId, currentPeriod.id, 'AI_POINT');

  if (aiState.balance !== balance || aiState.reserved !== reserved || aiState.available !== available) {
    await prisma.creditLedgerEntry.create({
      data: {
        userId: subscription.userId,
        billingPeriodId: currentPeriod.id,
        type: 'ADMIN_ADJUSTMENT',
        source: 'SYSTEM',
        unit: 'AI_POINT',
        amount: balance - aiState.balance,
        quantity: Math.abs(balance - aiState.balance),
        balanceBefore: aiState.balance,
        balanceAfter: balance,
        reservedAfter: reserved,
        availableAfter: available,
        idempotencyKey: `future-period-repair:${currentPeriod.id}`,
        reason: 'Consolidate charges from incorrectly created future billing periods',
        metadata: { sourcePeriodIds: sourceIds, generations: generationIds.length },
      },
    });
  }

  const legacyExcess = legacyPlanGrants._sum.amount ?? 0;
  if (legacyExcess > 0) {
    const legacyLatest = await prisma.creditLedgerEntry.findFirst({
      where: { userId: subscription.userId, unit: 'LEGACY_CREDIT' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const legacyBefore = legacyLatest?.balanceAfter ?? 0;
    const legacyAfter = Math.max(0, legacyBefore - legacyExcess);
    await prisma.creditLedgerEntry.create({
      data: {
        userId: subscription.userId,
        billingPeriodId: currentPeriod.id,
        type: 'ADMIN_ADJUSTMENT',
        source: 'SYSTEM',
        unit: 'LEGACY_CREDIT',
        amount: legacyAfter - legacyBefore,
        quantity: legacyBefore - legacyAfter,
        balanceBefore: legacyBefore,
        balanceAfter: legacyAfter,
        reservedAfter: 0,
        availableAfter: legacyAfter,
        idempotencyKey: `future-period-legacy-repair:${currentPeriod.id}`,
        reason: 'Remove duplicate legacy plan grants from future billing periods',
        metadata: { sourcePeriodIds: sourceIds },
      },
    });
  }

  return { ...summary, currentPeriodId: currentPeriod.id, balance, reserved, available };
}

async function main() {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { gt: now },
      user: { billingPeriods: { some: { status: 'OPEN', periodStart: { gt: now } } } },
    },
  });
  const results = [];
  for (const subscription of subscriptions) {
    const result = await repairSubscription(subscription);
    if (result) results.push(result);
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', now: now.toISOString(), results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
