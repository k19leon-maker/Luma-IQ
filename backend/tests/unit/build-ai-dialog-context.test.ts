import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());

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
});
