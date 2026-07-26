import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessions = new Map<string, {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>();

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    b2CSession: {
      findFirst: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        sessions.get(where.tokenHash) ?? null),
      create: vi.fn(async ({ data }: { data: { tokenHash: string; expiresAt: Date } }) => {
        const now = new Date();
        const session = {
          id: `session-${sessions.size + 1}`,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        };
        sessions.set(data.tokenHash, session);
        return session;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { expiresAt: Date } }) => {
        const session = [...sessions.values()].find((item) => item.id === where.id);
        if (!session) throw new Error('Session not found');
        session.expiresAt = data.expiresAt;
        return session;
      }),
      deleteMany: vi.fn(),
    },
  },
}));

import { ensureB2CSession } from '../../src/services/b2c-session.service';

function responseCookieJar() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  return {
    cookies,
    response: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    },
  };
}

describe('B2C session isolation', () => {
  beforeEach(() => sessions.clear());

  it('creates separate opaque sessions and restores only the matching owner cookie', async () => {
    const firstJar = responseCookieJar();
    const first = await ensureB2CSession(
      { cookies: {} } as never,
      firstJar.response as never,
    );
    const secondJar = responseCookieJar();
    const second = await ensureB2CSession(
      { cookies: {} } as never,
      secondJar.response as never,
    );

    expect(first.id).not.toBe(second.id);
    expect(firstJar.cookies[0].value).not.toBe(secondJar.cookies[0].value);
    expect(first.tokenHash).not.toBe(firstJar.cookies[0].value);
    expect(firstJar.cookies[0].options).toMatchObject({
      httpOnly: true,
      path: '/api/v1/b2c',
    });

    const restoredJar = responseCookieJar();
    const restored = await ensureB2CSession(
      { cookies: { semeyno_session: firstJar.cookies[0].value } } as never,
      restoredJar.response as never,
    );
    expect(restored.id).toBe(first.id);
    expect(restored.id).not.toBe(second.id);
  });
});
