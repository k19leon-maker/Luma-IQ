import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  getForUser: vi.fn(),
  linkAuthenticatedUser: vi.fn(),
  revokeForUser: vi.fn(),
}));

vi.mock('../../src/services/telegram-account.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/telegram-account.service')>();
  return {
    ...original,
    telegramAccountService: mocks,
  };
});

import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

function auth(userId: string): string {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('system Telegram account API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an authenticated Luma session', async () => {
    await request(createApp()).get('/api/v1/telegram-account').expect(401);
    expect(mocks.getForUser).not.toHaveBeenCalled();
  });

  it('derives the owner exclusively from the authenticated session', async () => {
    mocks.getForUser.mockResolvedValue(null);

    await request(createApp())
      .get('/api/v1/telegram-account?userId=user-b')
      .set('Authorization', auth('user-a'))
      .expect(200, { telegramAccount: null });

    expect(mocks.getForUser).toHaveBeenCalledWith('user-a');
  });

  it('rejects client-supplied ownership during linking', async () => {
    await request(createApp())
      .post('/api/v1/telegram-account/link')
      .set('Authorization', auth('user-a'))
      .send({ token: 'a'.repeat(43), userId: 'user-b' })
      .expect(400);

    expect(mocks.linkAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('revokes only the authenticated user link', async () => {
    mocks.revokeForUser.mockResolvedValue({ ok: true });

    await request(createApp())
      .delete('/api/v1/telegram-account')
      .set('Authorization', auth('user-a'))
      .send({ userId: 'user-b' })
      .expect(200, { ok: true });

    expect(mocks.revokeForUser).toHaveBeenCalledWith('user-a');
  });
});
