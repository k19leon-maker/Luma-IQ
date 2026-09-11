import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telegramAccount: { findUnique: vi.fn() },
  telegramLoginToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  project: { findFirst: vi.fn() },
  userEvent: { create: vi.fn() },
  issueTokensInTransaction: vi.fn(),
  toAuthUser: vi.fn((user: { id: string }) => ({ id: user.id })),
}));

const tx = {
  telegramAccount: mocks.telegramAccount,
  telegramLoginToken: mocks.telegramLoginToken,
  project: mocks.project,
  userEvent: mocks.userEvent,
};

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

vi.mock('../../src/services/auth.service', () => ({
  authService: { issueTokensInTransaction: mocks.issueTokensInTransaction },
  toAuthUser: mocks.toAuthUser,
}));

import {
  sanitizeTelegramRedirect,
  telegramLoginService,
} from '../../src/services/telegram-login.service';

const user = {
  id: 'user-a',
  email: 'a@example.com',
  name: null,
  avatarUrl: null,
  role: 'USER',
  isVerified: true,
  archivedAt: null,
};

const account = {
  id: 'telegram-account-a',
  userId: user.id,
  status: 'LINKED',
  user,
};

describe('Telegram browser login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.telegramLoginToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.telegramLoginToken.create.mockImplementation(async ({ data }) => ({
      id: 'login-token-a',
      expiresAt: data.expiresAt,
    }));
    mocks.userEvent.create.mockResolvedValue({ id: 'event-a' });
    mocks.issueTokensInTransaction.mockResolvedValue({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
    });
  });

  it('stores only a hash, revokes older tickets and keeps audit metadata free of secrets', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue(account);

    const result = await telegramLoginService.issueBrowserLogin({
      telegramAccountId: account.id,
      intendedPath: '/app/tg-channel?tab=content',
    });

    const createData = mocks.telegramLoginToken.create.mock.calls[0][0].data;
    expect(result.token).toHaveLength(43);
    expect(createData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createData.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(createData)).not.toContain(result.token);
    expect(mocks.telegramLoginToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ telegramAccountId: account.id, consumedAt: null, revokedAt: null }),
    }));
    const audit = mocks.userEvent.create.mock.calls[0][0].data;
    expect(JSON.stringify(audit)).not.toContain(result.token);
    expect(JSON.stringify(audit)).not.toContain('telegramUserId');
  });

  it('rejects a project that does not belong to the linked user', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue(account);
    mocks.project.findFirst.mockResolvedValue(null);

    await expect(telegramLoginService.issueBrowserLogin({
      telegramAccountId: account.id,
      intendedProjectId: 'foreign-project',
    })).rejects.toMatchObject({ status: 403, code: 'TELEGRAM_PROJECT_NOT_ALLOWED' });
    expect(mocks.telegramLoginToken.create).not.toHaveBeenCalled();
  });

  it('allows only known internal application routes', () => {
    expect(sanitizeTelegramRedirect('/app/strategy/cases/case-123?mode=edit')).toBe('/app/strategy/cases/case-123?mode=edit');
    expect(sanitizeTelegramRedirect('https://evil.example/app/dashboard')).toBe('/app/ai-dialog');
    expect(sanitizeTelegramRedirect('//evil.example/app/dashboard')).toBe('/app/ai-dialog');
    expect(sanitizeTelegramRedirect('/app/../auth/telegram')).toBe('/app/ai-dialog');
    expect(sanitizeTelegramRedirect('/auth/telegram')).toBe('/app/ai-dialog');
    expect(sanitizeTelegramRedirect('/app\\dashboard')).toBe('/app/ai-dialog');
  });

  it('consumes a ticket once and creates the normal auth session in the same transaction', async () => {
    mocks.telegramLoginToken.findUnique.mockResolvedValue({
      id: 'login-token-a',
      intendedProjectId: 'project-a',
      intendedPath: '/app/products/main',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      telegramAccount: account,
    });
    mocks.project.findFirst.mockResolvedValue({ id: 'project-a' });

    const result = await telegramLoginService.consumeBrowserLogin('valid-token-value-that-is-long-enough');

    expect(mocks.telegramLoginToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'login-token-a', consumedAt: null, revokedAt: null }),
      data: { consumedAt: expect.any(Date) },
    }));
    expect(mocks.issueTokensInTransaction).toHaveBeenCalledWith(tx, user.id);
    expect(result).toEqual({
      user: { id: user.id },
      tokens: { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' },
      redirect: { path: '/app/products/main', projectId: 'project-a' },
    });
  });

  it('rejects a concurrent replay when the atomic consume loses the race', async () => {
    mocks.telegramLoginToken.findUnique.mockResolvedValue({
      id: 'login-token-a',
      intendedProjectId: null,
      intendedPath: '/app/dashboard',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      telegramAccount: account,
    });
    mocks.telegramLoginToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(telegramLoginService.consumeBrowserLogin('valid-token-value-that-is-long-enough'))
      .rejects.toMatchObject({ status: 401, code: 'INVALID_TELEGRAM_LOGIN_TOKEN' });
    expect(mocks.issueTokensInTransaction).not.toHaveBeenCalled();
  });

  it('rejects expired tickets and tickets from revoked Telegram links', async () => {
    mocks.telegramLoginToken.findUnique.mockResolvedValueOnce({
      id: 'expired',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
      telegramAccount: account,
    });
    await expect(telegramLoginService.consumeBrowserLogin('expired-token-value-that-is-long-enough'))
      .rejects.toMatchObject({ status: 401 });

    mocks.telegramLoginToken.findUnique.mockResolvedValueOnce({
      id: 'revoked-link',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      telegramAccount: { ...account, status: 'REVOKED' },
    });
    await expect(telegramLoginService.consumeBrowserLogin('revoked-token-value-that-is-long-enough'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('drops a selected project that was archived after the ticket was issued', async () => {
    mocks.telegramLoginToken.findUnique.mockResolvedValue({
      id: 'login-token-a',
      intendedProjectId: 'archived-project',
      intendedPath: '/app/tasks',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      telegramAccount: account,
    });
    mocks.project.findFirst.mockResolvedValue(null);

    const result = await telegramLoginService.consumeBrowserLogin('valid-token-value-that-is-long-enough');
    expect(result.redirect).toEqual({ path: '/app/tasks', projectId: null });
  });
});
