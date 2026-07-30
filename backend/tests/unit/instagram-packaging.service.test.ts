import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, transactionMock } = vi.hoisted(() => {
  const transaction = {
    projectStructuredOutput: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    transactionMock: transaction,
    prismaMock: {
      project: {
        findFirst: vi.fn(),
      },
      projectStructuredOutput: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));

import { instagramPackagingService } from '../../src/services/instagram-packaging.service';

const currentPackaging = {
  version: 1 as const,
  profileHeader: {
    username: 'expert',
    displayName: 'Эксперт',
    category: 'Маркетинг',
    bio: 'Помогаю экспертам собирать маркетинг.',
    callToAction: 'Запишитесь на разбор',
    link: 'https://example.com',
    logicExplanation: 'Шапка ведёт к следующему шагу.',
  },
  highlights: [],
  updatedAt: '2026-07-30T10:00:00.000Z',
};

describe('instagramPackagingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.projectStructuredOutput.findFirst.mockResolvedValue(null);
  });

  it('returns current packaging only through an owner-scoped project query', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1', strategyData: {} });
    prismaMock.projectStructuredOutput.findFirst.mockResolvedValue({ data: currentPackaging });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
      select: { id: true, strategyData: true },
    });
    expect(prismaMock.projectStructuredOutput.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', projectId: 'project-1' }),
      }),
    );
    expect(result).toEqual({ packaging: currentPackaging, source: 'current' });
  });

  it('does not expose packaging when the project is not owned by the user', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    const result = await instagramPackagingService.get('user-2', 'project-1');

    expect(result).toBeNull();
    expect(prismaMock.projectStructuredOutput.findFirst).not.toHaveBeenCalled();
  });

  it('reads legacy Instagram text without changing Telegram or VK data', async () => {
    const strategyData = {
      generatedData: {
        social: {
          instagram: 'Старое описание Instagram',
          telegram: 'Старое описание Telegram',
          vk: 'Старое описание VK',
        },
      },
    };
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1', strategyData });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(result?.source).toBe('legacy');
    expect(result?.packaging.profileHeader.bio).toBe('Старое описание Instagram');
    expect(result?.packaging.metadata?.importedFrom).toBe('generatedData.social.instagram');
    expect(strategyData.generatedData.social.telegram).toBe('Старое описание Telegram');
    expect(strategyData.generatedData.social.vk).toBe('Старое описание VK');
    expect(transactionMock.projectStructuredOutput.create).not.toHaveBeenCalled();
  });

  it('replaces the current record transactionally on every save', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });

    const saved = await instagramPackagingService.save('user-1', 'project-1', {
      version: 1,
      profileHeader: currentPackaging.profileHeader,
      highlights: [],
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionMock.projectStructuredOutput.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        projectId: 'project-1',
        source: 'project_strategy',
        key: 'instagram.packaging.current',
      },
    });
    expect(transactionMock.projectStructuredOutput.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        domain: 'packaging',
        kind: 'instagram_packaging',
        key: 'instagram.packaging.current',
        source: 'project_strategy',
        version: 1,
      }),
    });
    expect(saved?.profileHeader.username).toBe('expert');
  });
});

