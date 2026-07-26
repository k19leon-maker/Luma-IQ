import { CreditLedgerSource, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export type AiPointLedgerState = {
  balance: number;
  reserved: number;
  available: number;
};

async function lockLedger(userId: string, billingPeriodId: string, tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(816271, hashtext(${`${userId}:${billingPeriodId}:AI_POINT`}))`;
}

async function state(userId: string, billingPeriodId: string, tx: Tx = prisma): Promise<AiPointLedgerState> {
  const latest = await tx.creditLedgerEntry.findFirst({
    where: { userId, billingPeriodId, unit: 'AI_POINT' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      balanceAfter: true,
      reservedAfter: true,
      availableAfter: true,
    },
  });
  return latest
    ? {
      balance: latest.balanceAfter,
      reserved: latest.reservedAfter,
      available: latest.availableAfter,
    }
    : { balance: 0, reserved: 0, available: 0 };
}

function exhausted(current: AiPointLedgerState, required: number) {
  return Object.assign(new Error('AI-баланс закончился'), {
    status: 402,
    code: 'AI_BALANCE_EXHAUSTED',
    limitType: 'aiBalance',
    current: current.available,
    required,
  });
}

function entryData(input: {
  userId: string;
  projectId?: string | null;
  billingPeriodId: string;
  generationId?: string | null;
  type: 'CREDIT' | 'RESERVE' | 'CAPTURE' | 'RELEASE' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'PLAN_ACCRUAL' | 'PURCHASE' | 'EXPIRATION';
  source: CreditLedgerSource;
  amount: number;
  quantity: number;
  before: AiPointLedgerState;
  after: AiPointLedgerState;
  actionKey?: string | null;
  idempotencyKey?: string | null;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
  settledAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return {
    userId: input.userId,
    projectId: input.projectId ?? null,
    billingPeriodId: input.billingPeriodId,
    generationId: input.generationId ?? null,
    type: input.type,
    source: input.source,
    unit: 'AI_POINT' as const,
    amount: input.amount,
    quantity: Math.abs(input.quantity),
    balanceBefore: input.before.balance,
    balanceAfter: input.after.balance,
    reservedAfter: input.after.reserved,
    availableAfter: input.after.available,
    actionKey: input.actionKey ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata,
    settledAt: input.settledAt ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

async function findLifecycleEntry(
  tx: Tx,
  generationId: string,
  type: 'RESERVE' | 'CAPTURE' | 'RELEASE' | 'REFUND',
) {
  return tx.creditLedgerEntry.findFirst({
    where: { unit: 'AI_POINT', generationId, type },
  });
}

type CaptureInput = {
  userId: string;
  projectId?: string | null;
  billingPeriodId: string;
  generationId: string;
  actionKey: string;
  metadata?: Prisma.InputJsonValue;
};

async function captureWithPersistence(
  input: CaptureInput,
  persist: (tx: Tx, points: number) => Promise<void>,
) {
  return prisma.$transaction(async (tx) => {
    await lockLedger(input.userId, input.billingPeriodId, tx);
    const existing = await findLifecycleEntry(tx, input.generationId, 'CAPTURE');
    if (existing) return existing;
    const [reservation, release] = await Promise.all([
      findLifecycleEntry(tx, input.generationId, 'RESERVE'),
      findLifecycleEntry(tx, input.generationId, 'RELEASE'),
    ]);
    if (!reservation) throw new Error('AI_POINT_RESERVATION_NOT_FOUND');
    if (release) throw new Error('AI_POINT_RESERVATION_ALREADY_RELEASED');
    const current = await state(input.userId, input.billingPeriodId, tx);
    const points = reservation.quantity;
    const after = {
      balance: current.balance - points,
      reserved: Math.max(0, current.reserved - points),
      available: current.available,
    };
    if (after.balance < 0 || after.available < 0) throw exhausted(current, points);
    await persist(tx, points);
    return tx.creditLedgerEntry.create({
      data: entryData({
        ...input,
        type: 'CAPTURE',
        source: 'AI_GENERATION',
        amount: -points,
        quantity: points,
        before: current,
        after,
        idempotencyKey: reservation.idempotencyKey,
        reason: `Capture ${input.actionKey}`,
        settledAt: new Date(),
      }),
    });
  });
}

export const aiPointLedgerService = {
  getState(userId: string, billingPeriodId: string, tx: Tx = prisma) {
    return state(userId, billingPeriodId, tx);
  },

  async ensurePlanAccrual(input: {
    userId: string;
    billingPeriodId: string;
    amount: number;
    planCode: string;
    expiresAt?: Date | null;
  }) {
    const idempotencyKey = `plan-accrual:${input.billingPeriodId}`;
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await tx.creditLedgerEntry.findFirst({
        where: { userId: input.userId, unit: 'AI_POINT', idempotencyKey, type: 'PLAN_ACCRUAL' },
      });
      if (existing) return existing;
      const before = await state(input.userId, input.billingPeriodId, tx);
      const after = {
        balance: before.balance + Math.max(0, input.amount),
        reserved: before.reserved,
        available: before.available + Math.max(0, input.amount),
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'PLAN_ACCRUAL',
          source: 'PLAN',
          amount: Math.max(0, input.amount),
          quantity: Math.max(0, input.amount),
          before,
          after,
          idempotencyKey,
          reason: `AI points for ${input.planCode}`,
          expiresAt: input.expiresAt,
          metadata: { planCode: input.planCode, accountingVersion: 'ai-points-v2' },
        }),
      });
    });
  },

  async reserve(input: {
    userId: string;
    projectId?: string | null;
    billingPeriodId: string;
    generationId: string;
    actionKey: string;
    points: number;
    idempotencyKey?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (!Number.isInteger(input.points) || input.points < 0) throw new Error('INVALID_AI_POINTS');
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await findLifecycleEntry(tx, input.generationId, 'RESERVE');
      if (existing) return existing;
      const current = await state(input.userId, input.billingPeriodId, tx);
      if (current.available < input.points) throw exhausted(current, input.points);
      const after = {
        balance: current.balance,
        reserved: current.reserved + input.points,
        available: current.available - input.points,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'RESERVE',
          source: 'AI_GENERATION',
          amount: 0,
          quantity: input.points,
          before: current,
          after,
          reason: `Reserve ${input.actionKey}`,
        }),
      });
    });
  },

  capture(input: CaptureInput) {
    return captureWithPersistence(input, async () => undefined);
  },

  captureWithPersistence(
    input: CaptureInput,
    persist: (tx: Tx, points: number) => Promise<void>,
  ) {
    return captureWithPersistence(input, persist);
  },

  async release(input: {
    userId: string;
    projectId?: string | null;
    billingPeriodId: string;
    generationId: string;
    actionKey: string;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await findLifecycleEntry(tx, input.generationId, 'RELEASE');
      if (existing) return existing;
      const [reservation, capture] = await Promise.all([
        findLifecycleEntry(tx, input.generationId, 'RESERVE'),
        findLifecycleEntry(tx, input.generationId, 'CAPTURE'),
      ]);
      if (!reservation) return null;
      if (capture) return null;
      const current = await state(input.userId, input.billingPeriodId, tx);
      const points = reservation.quantity;
      const after = {
        balance: current.balance,
        reserved: Math.max(0, current.reserved - points),
        available: current.available + points,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'RELEASE',
          source: 'AI_GENERATION',
          amount: 0,
          quantity: points,
          before: current,
          after,
          idempotencyKey: reservation.idempotencyKey,
          reason: input.reason ?? `Release ${input.actionKey}`,
          settledAt: new Date(),
        }),
      });
    });
  },

  async refund(input: {
    userId: string;
    projectId?: string | null;
    billingPeriodId: string;
    generationId: string;
    actionKey: string;
    reason: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await findLifecycleEntry(tx, input.generationId, 'REFUND');
      if (existing) return existing;
      const capture = await findLifecycleEntry(tx, input.generationId, 'CAPTURE');
      if (!capture) throw new Error('AI_POINT_CAPTURE_NOT_FOUND');
      const current = await state(input.userId, input.billingPeriodId, tx);
      const after = {
        balance: current.balance + capture.quantity,
        reserved: current.reserved,
        available: current.available + capture.quantity,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'REFUND',
          source: 'REFUND',
          amount: capture.quantity,
          quantity: capture.quantity,
          before: current,
          after,
          reason: input.reason,
          settledAt: new Date(),
        }),
      });
    });
  },

  async adminAdjustment(input: {
    userId: string;
    billingPeriodId: string;
    amount: number;
    reason: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const current = await state(input.userId, input.billingPeriodId, tx);
      const after = {
        balance: current.balance + input.amount,
        reserved: current.reserved,
        available: current.available + input.amount,
      };
      if (after.balance < 0 || after.available < 0) throw exhausted(current, Math.abs(input.amount));
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'ADMIN_ADJUSTMENT',
          source: 'ADMIN',
          amount: input.amount,
          quantity: Math.abs(input.amount),
          before: current,
          after,
          reason: input.reason,
        }),
      });
    });
  },

  async credit(input: {
    userId: string;
    billingPeriodId: string;
    amount: number;
    source: 'TRIBUTE' | 'PROMO' | 'SYSTEM';
    reason: string;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await tx.creditLedgerEntry.findFirst({
        where: {
          userId: input.userId,
          unit: 'AI_POINT',
          idempotencyKey: input.idempotencyKey,
          type: input.source === 'TRIBUTE' ? 'PURCHASE' : 'CREDIT',
        },
      });
      if (existing) return existing;
      const current = await state(input.userId, input.billingPeriodId, tx);
      const points = Math.max(0, input.amount);
      const after = {
        balance: current.balance + points,
        reserved: current.reserved,
        available: current.available + points,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: input.source === 'TRIBUTE' ? 'PURCHASE' : 'CREDIT',
          amount: points,
          quantity: points,
          before: current,
          after,
        }),
      });
    });
  },

  async expirePeriod(input: {
    userId: string;
    billingPeriodId: string;
    reason?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await tx.creditLedgerEntry.findFirst({
        where: {
          unit: 'AI_POINT',
          billingPeriodId: input.billingPeriodId,
          type: 'EXPIRATION',
        },
      });
      if (existing) return existing;
      const current = await state(input.userId, input.billingPeriodId, tx);
      const expiring = Math.max(0, current.available);
      const after = {
        balance: current.balance - expiring,
        reserved: current.reserved,
        available: 0,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'EXPIRATION',
          source: 'SYSTEM',
          amount: -expiring,
          quantity: expiring,
          before: current,
          after,
          idempotencyKey: `expiration:${input.billingPeriodId}`,
          reason: input.reason ?? 'Billing period expired',
          settledAt: new Date(),
        }),
      });
    });
  },

  async reconcileCapture(input: {
    userId: string;
    projectId?: string | null;
    billingPeriodId: string;
    generationId: string;
    actionKey: string;
    points: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockLedger(input.userId, input.billingPeriodId, tx);
      const existing = await findLifecycleEntry(tx, input.generationId, 'CAPTURE');
      if (existing) return existing;
      const current = await state(input.userId, input.billingPeriodId, tx);
      if (current.available < input.points) throw exhausted(current, input.points);
      const after = {
        balance: current.balance - input.points,
        reserved: current.reserved,
        available: current.available - input.points,
      };
      return tx.creditLedgerEntry.create({
        data: entryData({
          ...input,
          type: 'CAPTURE',
          source: 'SYSTEM',
          amount: -input.points,
          quantity: input.points,
          before: current,
          after,
          reason: `Reconcile ${input.actionKey}`,
          settledAt: new Date(),
          metadata: {
            accountingVersion: 'ai-points-v2',
            reconciledFromLegacy: true,
            ...(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
              ? input.metadata as Record<string, unknown>
              : {}),
          },
        }),
      });
    });
  },
};
