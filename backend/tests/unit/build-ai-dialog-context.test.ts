import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    caseStudy: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { buildAiDialogSystemPrompt } from '../../src/utils/buildAiDialogContext';

const mockedPrisma = vi.mocked(prisma, true);

function projectFixture(strategyData: unknown) {
  return {
    id: 'project-1',
    name: 'Проект нутрициолога',
    niche: 'Нутрициология',
    description: null,
    status: 'ACTIVE',
    strategyCompletedAt: null,
    strategyData,
    strategySummary: null,
    utpData: null,
    user: {
      name: 'Эксперт',
      email: 'expert@example.com',
      specialization: 'Глобальная специализация',
      defaultAiModel: null,
    },
    products: [],
    generatedTexts: [],
    contentPlanItems: [],
    jtbdSessions: [],
  };
}

describe('buildAiDialogSystemPrompt specialization source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.caseStudy.findMany.mockResolvedValue([]);
  });

  it('prefers the current project About profile', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({
      expertProfileData: {
        profession: 'Семейный нутрициолог',
      },
    }) as never);

    const prompt = await buildAiDialogSystemPrompt('user-1', 'project-1');

    expect(prompt).toContain('Специализация пользователя: Семейный нутрициолог');
    expect(prompt).not.toContain('Специализация пользователя: Глобальная специализация');
  });

  it('keeps the global profile field as a final fallback', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue({
      ...projectFixture({}),
      niche: null,
    } as never);

    const prompt = await buildAiDialogSystemPrompt('user-1', 'project-1');

    expect(prompt).toContain('Специализация пользователя: Глобальная специализация');
  });

  it('adds owner-scoped ready cases without source documents', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({}) as never);
    mockedPrisma.caseStudy.findMany.mockResolvedValue([{
      id: 'case-1',
      title: 'Кейс клиента',
      beforeText: 'Не было заявок.',
      actionsText: 'Собрали систему.',
      afterText: 'Появились заявки.',
      clientTask: null,
      clientProblem: null,
      desiredResult: null,
      marketingInsight: null,
      updatedAt: new Date('2026-08-12T10:00:00Z'),
    }] as never);

    const prompt = await buildAiDialogSystemPrompt('user-1', 'project-1');

    expect(prompt).toContain('ГОТОВЫЕ КЕЙСЫ ПРОЕКТА');
    expect(prompt).toContain('Кейс клиента');
    expect(prompt).toContain('Не представляй кейсы как опубликованные');
    expect(mockedPrisma.caseStudy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', projectId: 'project-1', status: 'ready' },
      take: 5,
      select: expect.not.objectContaining({ sourceText: true }),
    }));
  });
});
