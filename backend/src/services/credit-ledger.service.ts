import { CreditLedgerSource, CreditLedgerType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

async function currentBalance(userId: string, tx: Tx = prisma): Promise<number> {
  const last = await tx.creditLedgerEntry.findFirst({
    where: { userId, unit: 'LEGACY_CREDIT' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { balanceAfter: true },
  });
  return last?.balanceAfter ?? 0;
}

async function lockUserLedger(userId: string, tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(734125, hashtext(${userId}))`;
}

export const creditLedgerService = {
  getBalance(userId: string): Promise<number> {
    return currentBalance(userId);
  },

  async addEntry(input: {
    userId: string;
    projectId?: string | null;
    billingPeriodId?: string | null;
    type: CreditLedgerType;
    source: CreditLedgerSource;
    amount: number;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      await lockUserLedger(input.userId, tx);
      const balance = await currentBalance(input.userId, tx);
      const balanceAfter = balance + input.amount;
      if (balanceAfter < 0) {
        throw Object.assign(new Error('AI-баланс закончился'), { status: 402 });
      }

      return tx.creditLedgerEntry.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: input.billingPeriodId ?? null,
          type: input.type,
          source: input.source,
          unit: 'LEGACY_CREDIT',
          amount: input.amount,
          quantity: Math.abs(input.amount),
          balanceBefore: balance,
          balanceAfter,
          availableAfter: balanceAfter,
          reason: input.reason ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    });
  },

  grant(input: { userId: string; amount: number; billingPeriodId?: string | null; reason?: string; source?: CreditLedgerSource }) {
    return creditLedgerService.addEntry({
      userId: input.userId,
      billingPeriodId: input.billingPeriodId ?? null,
      type: 'GRANT',
      source: input.source ?? 'PLAN',
      amount: input.amount,
      reason: input.reason,
    });
  },

  reserve(input: { userId: string; projectId?: string | null; billingPeriodId?: string | null; amount: number; reason?: string; generationId?: string }) {
    return creditLedgerService.addEntry({
      userId: input.userId,
      projectId: input.projectId ?? null,
      billingPeriodId: input.billingPeriodId ?? null,
      type: 'RESERVE',
      source: 'AI_GENERATION',
      amount: -Math.abs(input.amount),
      reason: input.reason,
      metadata: input.generationId ? { generationId: input.generationId } : undefined,
    });
  },

  consume(input: { userId: string; projectId?: string | null; billingPeriodId?: string | null; amount: number; reason?: string; generationId?: string }) {
    return creditLedgerService.addEntry({
      userId: input.userId,
      projectId: input.projectId ?? null,
      billingPeriodId: input.billingPeriodId ?? null,
      type: 'CONSUME',
      source: 'AI_GENERATION',
      amount: -Math.abs(input.amount),
      reason: input.reason,
      metadata: input.generationId ? { generationId: input.generationId } : undefined,
    });
  },

  refund(input: { userId: string; projectId?: string | null; billingPeriodId?: string | null; amount: number; reason?: string; generationId?: string }) {
    return creditLedgerService.addEntry({
      userId: input.userId,
      projectId: input.projectId ?? null,
      billingPeriodId: input.billingPeriodId ?? null,
      type: 'REFUND',
      source: 'REFUND',
      amount: Math.abs(input.amount),
      reason: input.reason,
      metadata: input.generationId ? { generationId: input.generationId } : undefined,
    });
  },
};
