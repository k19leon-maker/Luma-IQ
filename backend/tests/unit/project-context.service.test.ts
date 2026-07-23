import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { projectContextService } from '../../src/services/project-context.service';

const mockedPrisma = vi.mocked(prisma, true);

const projectFixture = {
  id: 'project-1',
  userId: 'user-1',
  name: 'Проект',
  niche: 'Маркетинг для экспертов',
  description: 'Описание проекта',
  strategySummary: 'Стратегия проекта',
  strategyData: {
    positioning: 'Позиционирование проекта',
    chosenSegment: 'Эксперты',
    expertProfileData: {
      name: 'Эксперт',
      targetAudience: 'Эксперты услуг',
    },
  },
  utpData: {
    finalUtp: 'УТП проекта',
  },
  audienceAvatars: [],
  products: [],
  generatedTexts: [],
  jtbdSessions: [],
  castDevRecords: [
    {
      id: 'castdev-1',
      title: 'Интервью с клиентом',
      status: 'completed',
      transcriptText: 'ПОЛНАЯ ТРАНСКРИБАЦИЯ НЕ ДОЛЖНА ПОПАДАТЬ В КОНТЕКСТ',
      transcriptFormatted: 'ОТФОРМАТИРОВАННАЯ ТРАНСКРИБАЦИЯ НЕ ДОЛЖНА ПОПАДАТЬ В КОНТЕКСТ',
      analysis: {
        summaryForContext: 'Клиент хочет быстро понять, как получить заявки без хаотичного контента.',
        customerTasks: [
          { title: 'Получить заявки', quote: 'Мне нужно понять, откуда будут заявки' },
        ],
        fearsProblemsObjections: [
          { title: 'Страх тратить время впустую', type: 'fear', quote: 'Боюсь снова делать контент без результата' },
        ],
        desiresGoalsResults: [
          { title: 'Стабильный поток клиентов', quote: 'Хочу, чтобы заявки были регулярно' },
        ],
      },
    },
  ],
};

async function build(workflow: string) {
  mockedPrisma.project.findFirst.mockResolvedValue(projectFixture as never);
  return projectContextService.build({
    userId: 'user-1',
    projectId: 'project-1',
    workflow,
    step: workflow === 'tg-channel' ? 'plan' : 'generate',
  });
}

describe('projectContextService Cast Dev context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'product.main',
    'leadmagnet',
    'strategy.utp',
    'posts.post',
    'reels.script',
    'articles.article',
    'threads.plan',
    'tg-channel',
  ])('includes Cast Dev summary for %s without full transcript', async (workflow) => {
    const context = await build(workflow);

    expect(context.rendered).toContain('Cast Dev / реальные интервью клиентов');
    expect(context.rendered).toContain('Клиент хочет быстро понять');
    expect(context.rendered).toContain('Мне нужно понять, откуда будут заявки');
    expect(context.rendered).not.toContain('ПОЛНАЯ ТРАНСКРИБАЦИЯ');
    expect(context.rendered).not.toContain('ОТФОРМАТИРОВАННАЯ ТРАНСКРИБАЦИЯ');
  });

  it('does not include Cast Dev summary into castdev.analysis itself', async () => {
    const context = await build('castdev');

    expect(context.rendered).not.toContain('Cast Dev / реальные интервью клиентов');
    expect(context.rendered).not.toContain('Клиент хочет быстро понять');
  });
});
