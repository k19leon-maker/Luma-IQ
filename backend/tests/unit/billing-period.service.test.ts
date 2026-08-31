import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => {
  const prismaMock = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    billingPeriod: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  };
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  return { prisma: prismaMock };
});

vi.mock('../../src/services/credit-ledger.service', () => ({
  creditLedgerService: {
    grant: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { billingPeriodService, subscriptionPeriodBounds } from '../../src/services/billing-period.service';
import { creditLedgerService } from '../../src/services/credit-ledger.service';

const mockedPrisma = vi.mocked(prisma, true);
const mockedCredits = vi.mocked(creditLedgerService, true);

describe('billingPeriodService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates current period and grants monthly plan credits', async () => {
    mockedPrisma.billingPeriod.findFirst.mockResolvedValue(null);
    mockedPrisma.billingPeriod.create.mockResolvedValue({ id: 'period-1', planCode: 'PRO' } as never);
    mockedPrisma.billingPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.billingPeriod.findUniqueOrThrow.mockResolvedValue({
      id: 'period-1',
      userId: 'user-1',
      planCode: 'PRO',
      creditsGranted: 10000,
      periodEnd: new Date('2026-06-01T00:00:00.000Z'),
    } as never);

    const period = await billingPeriodService.getOrCreateCurrent(
      'user-1',
      { id: 'sub-1', userId: 'user-1', plan: 'PRO', status: 'ACTIVE', expiresAt: null } as never,
      new Date('2026-05-27T12:00:00.000Z'),
    );

    expect(mockedCredits.grant).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000, billingPeriodId: 'period-1' }));
    expect(period.creditsGranted).toBe(10000);
  });

  it('calculates UTC month bounds', () => {
    const bounds = billingPeriodService.getPeriodBounds(new Date('2026-05-27T12:00:00.000Z'));
    expect(bounds.periodStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(bounds.periodEnd.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('selects the subscription cycle containing now when access is extended for several months', () => {
    const bounds = subscriptionPeriodBounds(
      new Date('2026-10-05T13:05:09.567Z'),
      new Date('2026-08-31T13:00:00.000Z'),
    );

    expect(bounds.periodStart.toISOString()).toBe('2026-08-06T13:05:09.567Z');
    expect(bounds.periodEnd.toISOString()).toBe('2026-09-05T13:05:09.567Z');
  });

  it('serializes period creation with a database advisory lock', async () => {
    mockedPrisma.billingPeriod.findFirst.mockResolvedValue({
      id: 'period-existing',
      userId: 'user-1',
      planCode: 'PRO',
      creditsGranted: 10000,
      periodEnd: new Date('2026-09-05T13:05:09.567Z'),
    } as never);

    await billingPeriodService.getOrCreateCurrent(
      'user-1',
      { id: 'sub-1', userId: 'user-1', plan: 'PRO', status: 'ACTIVE', expiresAt: new Date('2026-10-05T13:05:09.567Z') } as never,
      new Date('2026-08-31T13:00:00.000Z'),
    );

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.billingPeriod.create).not.toHaveBeenCalled();
  });
});
