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

  it('returns an empty versioned document for a new project', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1', strategyData: {} });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(result?.source).toBe('empty');
    expect(result?.packaging).toMatchObject({
      version: 1,
      profileHeader: {
        username: '',
        displayName: '',
        bio: '',
      },
      highlights: [],
    });
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

  it('normalizes a partial pre-versioned current record without discarding known fields', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1', strategyData: {} });
    prismaMock.projectStructuredOutput.findFirst.mockResolvedValue({
      data: {
        profile: {
          name: 'Старое имя профиля',
          description: 'Сохранённое описание',
          cta: 'Напишите в директ',
        },
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
    });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(result?.source).toBe('current');
    expect(result?.packaging).toMatchObject({
      version: 1,
      profileHeader: {
        displayName: 'Старое имя профиля',
        bio: 'Сохранённое описание',
        callToAction: 'Напишите в директ',
      },
      metadata: { migratedFromVersion: 0 },
    });
    expect(transactionMock.projectStructuredOutput.create).not.toHaveBeenCalled();
  });

  it('keeps a partially filled current profile readable even when it is not save-valid yet', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      strategyData: { generatedData: { social: { instagram: 'Legacy fallback must not replace current' } } },
    });
    prismaMock.projectStructuredOutput.findFirst.mockResolvedValue({
      data: {
        version: 1,
        profileHeader: { username: 'expert_only' },
        highlights: [],
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
    });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(result?.source).toBe('current');
    expect(result?.packaging.profileHeader.username).toBe('expert_only');
    expect(result?.packaging.profileHeader.bio).toBe('');
  });

  it('falls back to legacy Instagram text when current data has no recognized fields', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      strategyData: {
        generatedData: {
          social: {
            instagram: 'Старое описание Instagram',
            telegram: 'Telegram остаётся на месте',
            vk: 'VK остаётся на месте',
          },
        },
      },
    });
    prismaMock.projectStructuredOutput.findFirst.mockResolvedValue({
      data: { unrelated: 'unknown early format' },
    });

    const result = await instagramPackagingService.get('user-1', 'project-1');

    expect(result?.source).toBe('legacy');
    expect(result?.packaging.profileHeader.bio).toBe('Старое описание Instagram');
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

  it('does not write packaging when the project is not owned by the user', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    const saved = await instagramPackagingService.save('user-2', 'project-1', {
      version: 1,
      profileHeader: currentPackaging.profileHeader,
      highlights: [],
    });

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-2' },
      select: { id: true },
    });
    expect(saved).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.projectStructuredOutput.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.projectStructuredOutput.create).not.toHaveBeenCalled();
  });

  it('stores Highlight order canonically from the submitted array', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });
    const first = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Кейсы',
      goal: '',
      description: '',
      icon: '',
      position: 99,
      stories: [],
    };
    const second = {
      ...first,
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Отзывы',
      position: 42,
    };

    const saved = await instagramPackagingService.save('user-1', 'project-1', {
      version: 1,
      profileHeader: currentPackaging.profileHeader,
      highlights: [first, second],
    });

    expect(saved?.highlights.map((item) => item.position)).toEqual([0, 1]);
  });

  it('stores story order canonically inside its Highlight', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });
    const story = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Первая сторис',
      role: '',
      goal: '',
      format: 'text' as const,
      customFormat: '',
      frame: '',
      screenText: '',
      speech: '',
      interactive: '',
      callToAction: '',
      transition: '',
      position: 50,
    };

    const saved = await instagramPackagingService.save('user-1', 'project-1', {
      version: 1,
      profileHeader: currentPackaging.profileHeader,
      highlights: [{
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Обо мне',
        goal: '',
        description: '',
        icon: '',
        position: 0,
        stories: [story, {
          ...story,
          id: '44444444-4444-4444-8444-444444444444',
          title: 'Вторая сторис',
          position: 20,
        }],
      }],
    });

    expect(saved?.highlights[0].stories.map((item) => item.position)).toEqual([0, 1]);
  });
});
