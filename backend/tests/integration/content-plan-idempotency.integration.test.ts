import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const database = vi.hoisted(() => ({
  item: null as Record<string, unknown> | null,
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => ({ userId: 'user-1' })),
    },
    contentPlanItem: {
      findFirst: vi.fn(async ({ where }: { where: { projectId: string; sourceId: string } }) => {
        if (!database.item) return null;
        return database.item.projectId === where.projectId && database.item.sourceId === where.sourceId
          ? database.item
          : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        database.item = {
          id: 'content-plan-item-1',
          ...data,
          createdAt: new Date('2026-08-26T10:00:00.000Z'),
          updatedAt: new Date('2026-08-26T10:00:00.000Z'),
        };
        return database.item;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        database.item = {
          ...database.item,
          ...data,
          updatedAt: new Date('2026-08-26T10:01:00.000Z'),
        };
        return database.item;
      }),
    },
  },
}));

import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceId = 'tg-channel:tg-plan-1-a1b2:tg-post-1-c3d4';

function authHeader() {
  return `Bearer ${jwt.sign({ sub: 'user-1' }, env.JWT_SECRET)}`;
}

describe('Content Plan TG idempotency API', () => {
  beforeEach(() => {
    database.item = null;
    vi.clearAllMocks();
  });

  it('updates the linked TG post instead of creating a duplicate on repeat action', async () => {
    const first = await request(createApp())
      .post('/api/v1/content-plan')
      .set('Authorization', authHeader())
      .send({
        projectId,
        type: 'post',
        title: 'Первая версия',
        content: 'Текст поста',
        platform: 'Telegram',
        status: 'draft',
        date: '2026-08-27',
        sourceId,
      })
      .expect(201);

    const repeated = await request(createApp())
      .post('/api/v1/content-plan')
      .set('Authorization', authHeader())
      .send({
        projectId,
        type: 'post',
        title: 'Обновлённая версия',
        content: 'Доработанный текст',
        platform: 'Telegram',
        status: 'draft',
        date: '2026-08-29',
        sourceId,
      })
      .expect(200);

    expect(first.body).toMatchObject({ created: true, item: { id: 'content-plan-item-1' } });
    expect(repeated.body).toMatchObject({
      created: false,
      item: {
        id: 'content-plan-item-1',
        title: 'Обновлённая версия',
        date: '2026-08-29',
        sourceId,
      },
    });
    expect(prisma.contentPlanItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.contentPlanItem.update).toHaveBeenCalledTimes(1);
  });
});
