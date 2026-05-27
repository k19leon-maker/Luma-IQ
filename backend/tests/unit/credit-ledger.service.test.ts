import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  creditLedgerEntry: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((fn) => fn(tx)),
    creditLedgerEntry: tx.creditLedgerEntry,
  },
}));

import { creditLedgerService } from '../../src/services/credit-ledger.service';

describe('creditLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds ledger entry and updates balance', async () => {
    tx.creditLedgerEntry.findFirst.mockResolvedValue({ balanceAfter: 10 });
    tx.creditLedgerEntry.create.mockImplementation(({ data }) => Promise.resolve({ id: 'entry-1', ...data }));

    const entry = await creditLedgerService.grant({ userId: 'user-1', amount: 15 });

    expect(entry.balanceAfter).toBe(25);
    expect(tx.creditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 15, balanceAfter: 25, type: 'GRANT' }),
    }));
  });

  it('blocks negative balances', async () => {
    tx.creditLedgerEntry.findFirst.mockResolvedValue({ balanceAfter: 2 });

    await expect(creditLedgerService.reserve({ userId: 'user-1', amount: 3 }))
      .rejects.toMatchObject({ status: 402 });
  });
});
