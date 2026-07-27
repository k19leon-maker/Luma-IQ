import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { usersController } from '../../src/controllers/users.controller';

const mockedPrisma = vi.mocked(prisma, true);

function responseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('usersController profile validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trims the user name before saving', async () => {
    mockedPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Леонид',
    } as never);
    const response = responseMock();

    await usersController.updateMe(
      { userId: 'user-1', body: { name: '  Леонид  ' } } as never,
      response as never,
    );

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { name: 'Леонид' },
    }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ name: 'Леонид' }),
    }));
  });

  it('rejects a name containing only spaces', async () => {
    const response = responseMock();

    await usersController.updateMe(
      { userId: 'user-1', body: { name: '   ' } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Имя не может быть пустым' });
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });
});
