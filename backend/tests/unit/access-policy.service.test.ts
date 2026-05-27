import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findUnique: vi.fn() },
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
});
