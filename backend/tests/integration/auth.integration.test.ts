import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    refresh: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getUserById: vi.fn(),
  },
}));

import { createApp } from '../../src/app';
import { authService } from '../../src/services/auth.service';

const mockedAuth = vi.mocked(authService, true);

describe('auth integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs in with httpOnly refresh cookie and csrf token, without exposing refresh token in JSON', async () => {
    mockedAuth.login.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com', name: null, avatarUrl: null, role: 'USER', isVerified: true },
      tokens: { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' },
    });

    const res = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'password' })
      .expect(200);

    expect(res.body.tokens.accessToken).toBe('access.jwt');
    expect(res.body.tokens.csrfToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie'].join(';')).toContain('HttpOnly');
  });
});
