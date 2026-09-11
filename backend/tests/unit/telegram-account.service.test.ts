import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telegramAccount: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  telegramLoginToken: { updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  userEvent: { create: vi.fn() },
  track: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramAccount: mocks.telegramAccount,
    user: mocks.user,
    userEvent: mocks.userEvent,
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      telegramAccount: mocks.telegramAccount,
      telegramLoginToken: mocks.telegramLoginToken,
      user: mocks.user,
      userEvent: mocks.userEvent,
    })),
  },
}));

vi.mock('../../src/services/event.service', () => ({
  eventService: { track: mocks.track },
}));

import {
  revokeTelegramAccountsInTransaction,
  telegramAccountService,
} from '../../src/services/telegram-account.service';

const pendingAccount = {
  id: 'telegram-account-1',
  userId: null,
  telegramUserId: '123456789',
  telegramChatId: '123456789',
  username: 'tester',
  firstName: 'Test',
  lastName: null,
  languageCode: 'ru',
  status: 'PENDING',
  linkTokenHash: null,
  linkTokenExpiresAt: null,
  linkTokenConsumedAt: null,
  firstSeenAt: new Date('2026-09-10T10:00:00.000Z'),
  lastSeenAt: new Date('2026-09-10T10:00:00.000Z'),
  linkedAt: null,
  revokedAt: null,
  blockedAt: null,
  createdAt: new Date('2026-09-10T10:00:00.000Z'),
  updatedAt: new Date('2026-09-10T10:00:00.000Z'),
};

const publicLinkedAccount = {
  id: pendingAccount.id,
  username: pendingAccount.username,
  firstName: pendingAccount.firstName,
  lastName: pendingAccount.lastName,
  languageCode: pendingAccount.languageCode,
  status: 'LINKED',
  linkedAt: new Date('2026-09-10T10:05:00.000Z'),
  revokedAt: null,
  createdAt: pendingAccount.createdAt,
  updatedAt: new Date('2026-09-10T10:05:00.000Z'),
};

describe('system Telegram account identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userEvent.create.mockResolvedValue({ id: 'event-1' });
    mocks.track.mockResolvedValue(undefined);
    mocks.telegramLoginToken.updateMany.mockResolvedValue({ count: 0 });
  });

  it('creates a pending identity without creating a Luma user and stores only a token hash', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue(null);
    mocks.telegramAccount.create.mockImplementation(async ({ data }) => ({ ...pendingAccount, ...data }));

    const result = await telegramAccountService.beginLinkFlow({
      telegramUserId: pendingAccount.telegramUserId,
      telegramChatId: pendingAccount.telegramChatId,
      username: pendingAccount.username,
      firstName: pendingAccount.firstName,
      languageCode: pendingAccount.languageCode,
    });

    expect(result.state).toBe('PENDING');
    expect(result).toHaveProperty('token');
    const createData = mocks.telegramAccount.create.mock.calls[0][0].data;
    expect(createData).not.toHaveProperty('userId');
    expect(createData.linkTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createData.linkTokenHash).not.toBe(result.state === 'PENDING' ? result.token : '');
    expect(JSON.stringify(createData)).not.toContain(result.state === 'PENDING' ? result.token : '');
    expect(mocks.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        type: 'telegram_identity_link_requested',
        metadata: { telegramAccountId: pendingAccount.id },
      }),
    }));
  });

  it('does not rotate a challenge for an already linked identity', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue({ ...pendingAccount, status: 'LINKED', userId: 'user-a' });
    mocks.telegramAccount.update.mockResolvedValue({ ...pendingAccount, status: 'LINKED', userId: 'user-a' });

    const result = await telegramAccountService.beginLinkFlow({
      telegramUserId: pendingAccount.telegramUserId,
      telegramChatId: pendingAccount.telegramChatId,
    });

    expect(result).toEqual({ state: 'LINKED', accountId: pendingAccount.id });
    expect(mocks.telegramAccount.create).not.toHaveBeenCalled();
    expect(mocks.userEvent.create).not.toHaveBeenCalled();
  });

  it('requires a verified, non-archived web account before linking', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'user-a', isVerified: false, archivedAt: null });

    await expect(telegramAccountService.linkAuthenticatedUser('user-a', 'a'.repeat(43))).rejects.toMatchObject({
      status: 403,
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
    expect(mocks.telegramAccount.updateMany).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('telegram_identity_link_rejected', expect.objectContaining({
      userId: 'user-a',
      metadata: { reason: 'EMAIL_VERIFICATION_REQUIRED' },
    }));
  });

  it('links exactly one pending identity and consumes the challenge once', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'user-a', isVerified: true, archivedAt: null });
    mocks.telegramAccount.findFirst
      .mockResolvedValueOnce({ ...pendingAccount, linkTokenHash: 'stored-hash' })
      .mockResolvedValueOnce(null);
    mocks.telegramAccount.updateMany.mockResolvedValue({ count: 1 });
    mocks.telegramAccount.findUniqueOrThrow.mockResolvedValue(publicLinkedAccount);

    const result = await telegramAccountService.linkAuthenticatedUser('user-a', 'secure-link-token-value-that-is-long-enough');

    expect(result).toEqual(publicLinkedAccount);
    expect(mocks.telegramAccount.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', status: 'LINKED' }),
    }));
    expect(mocks.telegramAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: pendingAccount.id, linkTokenConsumedAt: null }),
      data: expect.objectContaining({
        userId: 'user-a',
        status: 'LINKED',
        linkTokenHash: null,
      }),
    }));
    expect(mocks.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'telegram_identity_linked', userId: 'user-a' }),
    }));
  });

  it('rejects a replay when the challenge was consumed concurrently', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'user-a', isVerified: true, archivedAt: null });
    mocks.telegramAccount.findFirst
      .mockResolvedValueOnce({ ...pendingAccount, linkTokenHash: 'stored-hash' })
      .mockResolvedValueOnce(null);
    mocks.telegramAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      telegramAccountService.linkAuthenticatedUser('user-a', 'secure-link-token-value-that-is-long-enough'),
    ).rejects.toMatchObject({ status: 409, code: 'TELEGRAM_LINK_ALREADY_CONSUMED' });
    expect(mocks.track).toHaveBeenCalledWith('telegram_identity_link_rejected', expect.objectContaining({
      userId: 'user-a',
      metadata: { reason: 'TELEGRAM_LINK_ALREADY_CONSUMED' },
    }));
  });

  it('never returns another user account from the authenticated lookup', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'user-b', isVerified: true, archivedAt: null });
    mocks.telegramAccount.findFirst.mockResolvedValue(null);

    expect(await telegramAccountService.getForUser('user-b')).toBeNull();
    expect(mocks.telegramAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-b' },
    }));
  });

  it('revokes only the authenticated user link', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'user-b', isVerified: true, archivedAt: null });
    mocks.telegramAccount.findFirst.mockResolvedValue({ id: pendingAccount.id });
    mocks.telegramAccount.updateMany.mockResolvedValue({ count: 1 });

    await expect(telegramAccountService.revokeForUser('user-b')).resolves.toEqual({ ok: true });
    expect(mocks.telegramAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: pendingAccount.id, userId: 'user-b', status: 'LINKED' },
      data: expect.objectContaining({ status: 'REVOKED' }),
    }));
  });

  it('does not resolve an archived linked user for the system bot', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue({
      id: pendingAccount.id,
      status: 'LINKED',
      user: { id: 'user-a', archivedAt: new Date(), isVerified: true },
    });

    await expect(telegramAccountService.resolveLinkedUser(pendingAccount.telegramUserId)).resolves.toBeNull();
  });

  it('marks a Telegram identity blocked without storing Telegram identifiers in audit metadata', async () => {
    mocks.telegramAccount.findUnique.mockResolvedValue({
      id: pendingAccount.id,
      userId: 'user-a',
      status: 'LINKED',
    });
    mocks.telegramAccount.update.mockResolvedValue({ ...pendingAccount, status: 'BLOCKED' });

    await telegramAccountService.markBlocked(pendingAccount.telegramUserId);

    expect(mocks.telegramAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: pendingAccount.id },
      data: expect.objectContaining({ status: 'BLOCKED', linkTokenHash: null }),
    }));
    const metadata = mocks.userEvent.create.mock.calls[0][0].data.metadata;
    expect(metadata).toEqual({ telegramAccountId: pendingAccount.id });
    expect(JSON.stringify(metadata)).not.toContain(pendingAccount.telegramUserId);
  });

  it('revokes linked identities in the same transaction when a user is archived', async () => {
    mocks.telegramAccount.updateMany.mockResolvedValue({ count: 1 });
    const tx = {
      telegramAccount: mocks.telegramAccount,
      telegramLoginToken: mocks.telegramLoginToken,
      userEvent: mocks.userEvent,
    } as never;

    await expect(revokeTelegramAccountsInTransaction(tx, 'user-a', 'admin-a', 'user_archived')).resolves.toBe(1);
    expect(mocks.telegramAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', status: 'LINKED' },
      data: expect.objectContaining({ status: 'REVOKED' }),
    }));
    expect(mocks.userEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a',
        actorId: 'admin-a',
        type: 'telegram_identity_revoked',
      }),
    }));
  });
});
