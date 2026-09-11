import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshTokenCreate: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    refreshToken: { create: mocks.refreshTokenCreate },
  },
}));

import { authService } from '../../src/services/auth.service';

describe('auth token issuance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'refresh-token' });
  });

  it('issues unique refresh JWTs for concurrent sessions of the same user', async () => {
    const [first, second] = await Promise.all([
      authService.issueTokens('user-a'),
      authService.issueTokens('user-a'),
    ]);

    expect(first.refreshToken).not.toBe(second.refreshToken);
    const storedHashes = mocks.refreshTokenCreate.mock.calls.map((call) => call[0].data.token);
    expect(storedHashes).toHaveLength(2);
    expect(storedHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHashes[0]).not.toBe(storedHashes[1]);
  });
});
