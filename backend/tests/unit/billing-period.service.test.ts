import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    billingPeriod: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/credit-ledger.service', () => ({
  creditLedgerService: {
    grant: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { billingPeriodService } from '../../src/services/billing-period.service';
import { creditLedgerService } from '../../src/services/credit-ledger.service';

const mockedPrisma = vi.mocked(prisma, true);
const mockedCredits = vi.mocked(creditLedgerService, true);

describe('billingPeriodService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates current period and grants monthly plan credits', async () => {
    mockedPrisma.billingPeriod.findFirst.mockResolvedValue(null);
    mockedPrisma.billingPeriod.create.mockResolvedValue({ id: 'period-1', planCode: 'PRO' } as never);
    mockedPrisma.billingPeriod.update.mockImplementation(({ data }) => Promise.resolve({ id: 'period-1', ...data }) as never);

    const period = await billingPeriodService.getOrCreateCurrent(
      'user-1',
      { id: 'sub-1', userId: 'user-1', plan: 'PRO', status: 'ACTIVE', expiresAt: null } as never,
      new Date('2026-05-27T12:00:00.000Z'),
    );

    expect(mockedCredits.grant).toHaveBeenCalledWith(expect.objectContaining({ amount: 3000, billingPeriodId: 'period-1' }));
    expect(period.creditsGranted).toBe(3000);
  });

  it('calculates UTC month bounds', () => {
    const bounds = billingPeriodService.getPeriodBounds(new Date('2026-05-27T12:00:00.000Z'));
    expect(bounds.periodStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(bounds.periodEnd.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});
