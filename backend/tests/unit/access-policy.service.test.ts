import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    aIGeneration: { count: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { accessPolicyService, AccessPolicyError } from '../../src/services/access-policy.service';

const mockedPrisma = vi.mocked(prisma, true);

describe('accessPolicyService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows project owner', async () => {
    mockedPrisma.project.findUnique.mockResolvedValue({ userId: 'user-1' } as never);

    await expect(accessPolicyService.assertProjectOwner('user-1', 'project-1')).resolves.toBeUndefined();
  });

  it('blocks another user project', async () => {
    mockedPrisma.project.findUnique.mockResolvedValue({ userId: 'other-user' } as never);

    await expect(accessPolicyService.assertProjectOwner('user-1', 'project-1'))
      .rejects.toBeInstanceOf(AccessPolicyError);
  });

  it('does not block user features by legacy heavy/content/youtube/longread limits', async () => {
    mockedPrisma.aIGeneration.count.mockResolvedValue(999 as never);

    await expect(accessPolicyService.assertRollingLimits({
      userId: 'user-1',
      featureCode: 'lead_magnet',
      generationClass: 'HEAVY',
      chatDailyLimit: 1000,
      dailyGenerationLimit: 1000,
      monthlyGenerationLimit: 1000,
      heavyGenerationLimit: 0,
      billingPeriodId: 'period-1',
      planId: 'PRO',
      monthlyContentUnits: 0,
      youtubeScriptsLimit: 0,
      longreadsLimit: 0,
    })).resolves.toBeUndefined();
  });
});
