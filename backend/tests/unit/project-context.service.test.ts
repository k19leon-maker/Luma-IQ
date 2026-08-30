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

describe('projectContextService CustDev context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.caseStudy.findMany.mockResolvedValue([]);
  });

  it.each([
    'product.main',
    'leadmagnet',
    'posts.post',
    'reels.script',
    'articles.article',
    'threads.plan',
    'tg-channel',
    'instagram.profile',
  ])('includes CustDev summary for %s without full transcript', async (workflow) => {
    const context = await build(workflow);

    expect(context.rendered).toContain('CustDev / реальные интервью клиентов');
    expect(context.rendered).toContain('Клиент хочет быстро понять');
    expect(context.rendered).toContain('Мне нужно понять, откуда будут заявки');
    expect(context.rendered).not.toContain('ПОЛНАЯ ТРАНСКРИБАЦИЯ');
    expect(context.rendered).not.toContain('ОТФОРМАТИРОВАННАЯ ТРАНСКРИБАЦИЯ');
  });

  it('uses the compact UTP foundation for UI and AI without full CustDev transcripts', async () => {
    const context = await build('strategy.utp');

    expect(context.contextVersion).toBe('utp-foundation-v1');
    expect(context.utpFoundation).toMatchObject({
      version: 1,
      projectId: 'project-1',
      audience: { status: 'ready', value: 'Эксперты' },
    });
    expect(context.blocks.map((block) => block.key)).toEqual(['utp_foundation', 'workflow_inputs']);
    expect(context.rendered).toContain('Основа для УТП');
    expect(context.rendered).toContain('Боюсь снова делать контент без результата');
    expect(context.rendered).toContain('source: castdev:castdev-1.analysis.fearsProblemsObjections[0]');
    expect(context.rendered).not.toContain('ПОЛНАЯ ТРАНСКРИБАЦИЯ');
    expect(context.rendered).not.toContain('ОТФОРМАТИРОВАННАЯ ТРАНСКРИБАЦИЯ');
  });

  it.each([
    'product.main.build',
    'product.mini.build',
    'leadmagnet.build',
    'posts.topic.generate',
    'posts.post.write',
    'posts.post.edit',
    'reels.hooks.generate',
    'reels.script.write',
    'reels.script.edit',
    'articles.topic.generate',
    'articles.article.write',
    'articles.article.edit',
    'threads.plan.generate',
    'threads.post.edit',
    'tg-channel.description',
    'tg-channel.plan',
    'instagram.profile',
    'instagram.story.improve',
    'chatbot.chain.generate',
    'chatbot.chain.edit',
    'video.topic.generate',
    'video.script.write',
    'video.script.edit',
    'content-plan',
  ])('uses UTP as a high-priority foundation for %s', async (workflow) => {
    const context = await build(workflow);
    const utpBlock = context.blocks.find((block) => block.key === 'utp_summary');

    expect(utpBlock?.priority).toBe('high');
    expect(utpBlock?.content).toContain('УТП проекта');
    expect(context.rendered).toContain('## УТП');
  });

  it('falls back to the current generated UTP stored in strategy data', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue({
      ...projectFixture,
      utpData: { finalUtp: 'Устаревшее УТП' },
      strategyData: {
        ...projectFixture.strategyData,
        generatedData: { utp: 'УТП из актуального раздела стратегии' },
      },
    } as never);

    const context = await projectContextService.build({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'product.main',
      step: 'generate',
    });

    expect(context.blocks.find((block) => block.key === 'utp_summary')?.content)
      .toContain('УТП из актуального раздела стратегии');
    expect(context.rendered).not.toContain('Устаревшее УТП');
  });

  it('does not include CustDev summary into castdev.analysis itself', async () => {
    const context = await build('castdev');

    expect(context.rendered).not.toContain('CustDev / реальные интервью клиентов');
    expect(context.rendered).not.toContain('Клиент хочет быстро понять');
    expect(mockedPrisma.caseStudy.findMany).not.toHaveBeenCalled();
  });

  it.each([
    'strategy.offer',
    'product.main',
    'leadmagnet',
    'posts.post',
    'reels.script',
    'articles.article',
    'threads.plan',
    'tg-channel',
    'chatbot.chain',
    'video.script',
    'content-plan',
  ])('adds only ready case summaries to %s', async (workflow) => {
    mockedPrisma.caseStudy.findMany.mockResolvedValue([{
      id: 'case-ready',
      title: 'Рост заявок',
      beforeText: 'Заявки шли только по рекомендациям.',
      actionsText: 'Собрали позиционирование и воронку.',
      afterText: 'Появились заявки из контента.',
      clientTask: 'Получать заявки онлайн.',
      clientProblem: null,
      desiredResult: null,
      marketingInsight: 'Показывать переход к системе.',
      updatedAt: new Date('2026-08-12T10:00:00Z'),
    }] as never);

    const context = await build(workflow);

    expect(context.contextVersion).toBe('project-context-v3');
    expect(context.rendered).toContain('Готовые кейсы проекта');
    expect(context.rendered).toContain('Рост заявок');
    expect(context.rendered).toContain('Не называй кейс опубликованным');
    expect(context.blocks.find((block) => block.key === 'cases_summary')?.sourceFingerprint)
      .toBe('case-ready:2026-08-12T10:00:00.000Z');
    expect(mockedPrisma.caseStudy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', projectId: 'project-1', status: 'ready' },
      take: 5,
      select: expect.not.objectContaining({ sourceText: true }),
    }));
  });

  it.each(['cases', 'castdev', 'positioning.analysis', 'instagram.profile'])('does not query or include cases in %s', async (workflow) => {
    const context = await build(workflow);

    expect(context.rendered).not.toContain('Готовые кейсы проекта');
    expect(mockedPrisma.caseStudy.findMany).not.toHaveBeenCalled();
  });

  it('builds compact Telegram description context without content history or case records', async () => {
    mockedPrisma.caseStudy.findMany.mockResolvedValue([{
      id: 'case-ready',
      title: 'Не должен попасть в контекст',
      updatedAt: new Date(),
    }] as never);

    const context = await projectContextService.build({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'tg-channel.description',
      step: 'generate',
      inputs: {
        currentChannelName: 'Канал эксперта',
        currentChannelDescription: 'Описание',
        instruction: 'Сделай конкретнее',
      },
    });

    expect(context.blocks.map((block) => block.key)).not.toContain('content_history');
    expect(context.blocks.map((block) => block.key)).not.toContain('cases_summary');
    expect(context.approxTokens).toBeLessThanOrEqual(5_200);
    expect(mockedPrisma.caseStudy.findMany).not.toHaveBeenCalled();
  });
});
