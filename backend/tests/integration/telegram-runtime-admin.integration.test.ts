import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  recoverJob: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('../../src/services/telegram-runtime-admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/telegram-runtime-admin.service')>();
  return {
    ...actual,
    telegramRuntimeAdminService: { recoverJob: mocks.recoverJob },
  };
});

import { createApp } from '../../src/app';

const jobId = '11111111-1111-4111-8111-111111111111';

function authHeader(userId: string): string {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('Telegram runtime admin recovery API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication and an admin role', async () => {
    await request(createApp())
      .post(`/api/v1/admin/telegram-runtime/jobs/inbound/${jobId}/recover`)
      .send({ confirm: true })
      .expect(401);

    mocks.userFindUnique.mockResolvedValue({ role: 'USER' });
    await request(createApp())
      .post(`/api/v1/admin/telegram-runtime/jobs/inbound/${jobId}/recover`)
      .set('Authorization', authHeader('regular-user'))
      .send({ confirm: true })
      .expect(403);

    expect(mocks.recoverJob).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and forwards only validated data', async () => {
    mocks.userFindUnique.mockResolvedValue({ role: 'ADMIN' });

    await request(createApp())
      .post(`/api/v1/admin/telegram-runtime/jobs/delivery/${jobId}/recover`)
      .set('Authorization', authHeader('admin-user'))
      .send({ confirm: false })
      .expect(400);

    mocks.recoverJob.mockResolvedValue({ queue: 'delivery', jobId, status: 'PENDING' });
    await request(createApp())
      .post(`/api/v1/admin/telegram-runtime/jobs/delivery/${jobId}/recover`)
      .set('Authorization', authHeader('admin-user'))
      .send({ confirm: true })
      .expect(200, {
        ok: true,
        job: { queue: 'delivery', jobId, status: 'PENDING' },
      });

    expect(mocks.recoverJob).toHaveBeenCalledOnce();
    expect(mocks.recoverJob).toHaveBeenCalledWith('delivery', jobId, 'admin-user');
  });
});
