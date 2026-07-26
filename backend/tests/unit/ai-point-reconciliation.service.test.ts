import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  creditLedgerEntry: { findMany: vi.fn(), findFirst: vi.fn() },
  aIGeneration: { update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  aIConfigurationAuditLog: { create: vi.fn() },
  $transaction: vi.fn(async (operations) => Promise.all(operations)),
}));

const ledgerMock = vi.hoisted(() => ({
  ensurePlanAccrual: vi.fn(),
  reconcileCapture: vi.fn(),
  getState: vi.fn(),
  capture: vi.fn(),
  release: vi.fn(),
  refund: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../src/services/ai-point-ledger.service', () => ({
  aiPointLedgerService: ledgerMock,
}));
vi.mock('../../src/services/access-policy.service', () => ({
  accessPolicyService: { getUserAccess: vi.fn() },
}));
vi.mock('../../src/services/ai-balance.service', () => ({
  aiBalanceService: { resolvePointsForGeneration: vi.fn() },
}));

import { aiPointReconciliationService } from '../../src/services/ai-point-reconciliation.service';

describe('aiPointReconciliationService sweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.aIGeneration.update.mockResolvedValue({});
    ledgerMock.release.mockResolvedValue({ id: 'release-1' });
    ledgerMock.capture.mockResolvedValue({ id: 'capture-1' });
  });

  it('releases stale failed reservations', async () => {
    prismaMock.creditLedgerEntry.findMany.mockResolvedValue([{
      userId: 'user-1',
      projectId: 'project-1',
      billingPeriodId: 'period-1',
      generationId: 'generation-1',
      actionKey: 'positioning',
      generation: {
        id: 'generation-1',
        status: 'FAILED',
        userId: 'user-1',
        projectId: 'project-1',
        billingPeriodId: 'period-1',
        featureCode: 'positioning',
        workflowRun: null,
      },
    }]);

    const result = await aiPointReconciliationService.sweepStaleReservations();

    expect(ledgerMock.release).toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, released: 1, captured: 0 });
  });

  it('does not release an active workflow reservation', async () => {
    prismaMock.creditLedgerEntry.findMany.mockResolvedValue([{
      generation: {
        id: 'generation-1',
        status: 'RUNNING',
        userId: 'user-1',
        projectId: 'project-1',
        billingPeriodId: 'period-1',
        featureCode: 'positioning',
        workflowRun: { status: 'RUNNING' },
      },
    }]);

    const result = await aiPointReconciliationService.sweepStaleReservations();

    expect(ledgerMock.release).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, skipped: 1 });
  });

  it('captures a successful generation that was saved before settlement', async () => {
    prismaMock.creditLedgerEntry.findMany.mockResolvedValue([{
      actionKey: 'positioning',
      generation: {
        id: 'generation-1',
        status: 'SUCCEEDED',
        userId: 'user-1',
        projectId: 'project-1',
        billingPeriodId: 'period-1',
        featureCode: 'positioning',
        workflowRun: null,
      },
    }]);

    const result = await aiPointReconciliationService.sweepStaleReservations();

    expect(ledgerMock.capture).toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, captured: 1, released: 0 });
  });
});
