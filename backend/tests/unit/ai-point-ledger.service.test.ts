import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  creditLedgerEntry: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(tx)),
    creditLedgerEntry: tx.creditLedgerEntry,
  },
}));

import { aiPointLedgerService } from '../../src/services/ai-point-ledger.service';

const ledgerState = (balance: number, reserved: number, available: number) => ({
  balanceAfter: balance,
  reservedAfter: reserved,
  availableAfter: available,
});

describe('aiPointLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(undefined);
    tx.creditLedgerEntry.create.mockImplementation(({ data }) => Promise.resolve({ id: 'entry-1', ...data }));
  });

  it('reserves available points without reducing posted balance', async () => {
    tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ledgerState(100, 0, 100));

    const reservation = await aiPointLedgerService.reserve({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'product_main',
      points: 60,
      idempotencyKey: 'request-1',
    });

    expect(reservation).toMatchObject({
      type: 'RESERVE',
      amount: 0,
      quantity: 60,
      balanceAfter: 100,
      reservedAfter: 60,
      availableAfter: 40,
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(tx.creditLedgerEntry.findFirst.mock.invocationCallOrder[0]);
  });

  it('blocks concurrent-style over-reservation against current available balance', async () => {
    tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ledgerState(100, 80, 20));

    await expect(aiPointLedgerService.reserve({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-2',
      actionKey: 'product_main',
      points: 60,
    })).rejects.toMatchObject({
      code: 'AI_BALANCE_EXHAUSTED',
      current: 20,
      required: 60,
    });
    expect(tx.creditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('is idempotent when the same generation is reserved again', async () => {
    tx.creditLedgerEntry.findFirst.mockResolvedValueOnce({
      id: 'existing-reserve',
      type: 'RESERVE',
      generationId: 'generation-1',
    });

    const entry = await aiPointLedgerService.reserve({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'ai_chat',
      points: 1,
    });

    expect(entry.id).toBe('existing-reserve');
    expect(tx.creditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('captures once and persists the completed result in the same transaction', async () => {
    tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: 20, idempotencyKey: 'request-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ledgerState(100, 20, 80));
    const persist = vi.fn(async () => undefined);

    const capture = await aiPointLedgerService.captureWithPersistence({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'positioning',
    }, persist);

    expect(persist).toHaveBeenCalledWith(tx, 20);
    expect(capture).toMatchObject({
      type: 'CAPTURE',
      amount: -20,
      quantity: 20,
      balanceAfter: 80,
      reservedAfter: 0,
      availableAfter: 80,
    });
    expect(persist.mock.invocationCallOrder[0])
      .toBeLessThan(tx.creditLedgerEntry.create.mock.invocationCallOrder[0]);
  });

  it('releases a failed reservation without reducing the balance', async () => {
    tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: 20, idempotencyKey: 'request-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ledgerState(100, 20, 80));

    const release = await aiPointLedgerService.release({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'positioning',
    });

    expect(release).toMatchObject({
      type: 'RELEASE',
      amount: 0,
      quantity: 20,
      balanceAfter: 100,
      reservedAfter: 0,
      availableAfter: 100,
    });
  });

  it('refunds only a previously captured generation', async () => {
    tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: 20 })
      .mockResolvedValueOnce(ledgerState(80, 0, 80));

    const refund = await aiPointLedgerService.refund({
      userId: 'user-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'positioning',
      reason: 'Confirmed compensation',
    });

    expect(refund).toMatchObject({
      type: 'REFUND',
      amount: 20,
      quantity: 20,
      balanceAfter: 100,
      availableAfter: 100,
    });
  });
});
