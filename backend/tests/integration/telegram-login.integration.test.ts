import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  consumeBrowserLogin: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../src/services/auth.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/auth.service')>();
  return {
    ...original,
    authService: { ...original.authService, logout: mocks.logout },
  };
});

vi.mock('../../src/services/telegram-login.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/telegram-login.service')>();
  return {
    ...original,
    telegramLoginService: { consumeBrowserLogin: mocks.consumeBrowserLogin },
  };
});

import { createApp } from '../../src/app';

describe('Telegram browser auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue(undefined);
    mocks.consumeBrowserLogin.mockResolvedValue({
      user: { id: 'user-a', email: 'a@example.com', name: null, avatarUrl: null, role: 'USER', isVerified: true },
      tokens: { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' },
      redirect: { path: '/app/tg-channel', projectId: 'project-a' },
    });
  });

  it('rejects a foreign browser origin before consuming the ticket', async () => {
    await request(createApp())
      .post('/api/v1/auth/telegram/session')
      .set('Origin', 'https://evil.example')
      .send({ token: 'a'.repeat(43) })
      .expect(403);
    expect(mocks.consumeBrowserLogin).not.toHaveBeenCalled();
  });

  it('rejects extra ownership fields and malformed tickets', async () => {
    await request(createApp())
      .post('/api/v1/auth/telegram/session')
      .set('Origin', 'http://localhost:5174')
      .send({ token: 'short', userId: 'user-b' })
      .expect(400);
    expect(mocks.consumeBrowserLogin).not.toHaveBeenCalled();
  });

  it('creates the standard cookie session without exposing the refresh token', async () => {
    const token = 'a'.repeat(43);
    const response = await request(createApp())
      .post('/api/v1/auth/telegram/session')
      .set('Origin', 'http://localhost:5174')
      .send({ token })
      .expect(200);

    expect(mocks.consumeBrowserLogin).toHaveBeenCalledWith(token);
    expect(response.body).toEqual(expect.objectContaining({
      user: expect.objectContaining({ id: 'user-a' }),
      tokens: expect.objectContaining({ accessToken: 'access.jwt', csrfToken: expect.any(String) }),
      redirect: { path: '/app/tg-channel', projectId: 'project-a' },
    }));
    expect(response.body.tokens.refreshToken).toBeUndefined();
    const cookies = response.headers['set-cookie'].join(';');
    expect(cookies).toContain('refresh_token=refresh.jwt');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Lax');
  });

  it('uses the ordinary logout flow after Telegram login', async () => {
    const login = await request(createApp())
      .post('/api/v1/auth/telegram/session')
      .set('Origin', 'http://localhost:5174')
      .send({ token: 'a'.repeat(43) })
      .expect(200);

    const cookies = login.headers['set-cookie'].map((value: string) => value.split(';')[0]);
    await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', login.body.tokens.csrfToken)
      .expect(200, { message: 'Выход выполнен' });

    expect(mocks.logout).toHaveBeenCalledWith('refresh.jwt');
  });
});
