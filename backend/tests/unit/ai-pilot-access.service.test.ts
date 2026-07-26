import { beforeEach, describe, expect, it, vi } from 'vitest';

const userFind = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  AI_ORCHESTRATION_V2_USERS: '',
  AI_ORCHESTRATION_V2_ROLLOUT_PERCENT: 0,
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));
vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: userFind } },
}));

import { aiPilotAccessService, rolloutBucket } from '../../src/services/ai-pilot-access.service';

describe('aiPilotAccessService rollout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.AI_ORCHESTRATION_V2_USERS = '';
    envMock.AI_ORCHESTRATION_V2_ROLLOUT_PERCENT = 0;
    userFind.mockResolvedValue({ email: 'user@example.com', role: 'USER' });
  });

  it('keeps the same user in a stable rollout bucket', () => {
    expect(rolloutBucket('user-123')).toBe(rolloutBucket('user-123'));
    expect(rolloutBucket('user-123')).toBeGreaterThanOrEqual(0);
    expect(rolloutBucket('user-123')).toBeLessThan(100);
  });

  it('always selects admins when V2 flags and action allowlist permit the action', async () => {
    userFind.mockResolvedValue({ email: 'admin@example.com', role: 'ADMIN' });
    await expect(aiPilotAccessService.isSelected('admin-id')).resolves.toBe(true);
  });

  it('selects explicit users before percentage rollout', async () => {
    envMock.AI_ORCHESTRATION_V2_USERS = 'user@example.com';
    await expect(aiPilotAccessService.isSelected('user-id')).resolves.toBe(true);
  });

  it('uses deterministic percentage for ordinary users', async () => {
    const userId = 'ordinary-user';
    envMock.AI_ORCHESTRATION_V2_ROLLOUT_PERCENT = rolloutBucket(userId);
    await expect(aiPilotAccessService.isSelected(userId)).resolves.toBe(false);
    envMock.AI_ORCHESTRATION_V2_ROLLOUT_PERCENT = rolloutBucket(userId) + 1;
    await expect(aiPilotAccessService.isSelected(userId)).resolves.toBe(true);
  });
});
