import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    caseStudy: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  UtpFoundationNotFoundError,
  renderUtpFoundationForPrompt,
  utpFoundationService,
} from '../../src/services/utp-foundation.service';

const mockedPrisma = vi.mocked(prisma, true);

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Проект эксперта',
    niche: 'Маркетинг для экспертов',
    strategyData: {
      answers: {
        chosenSegment: 'Эксперты услуг',
        chosenRequest: 'Собрать системный маркетинг без большой команды',
        corePains: ['Разрозненные материалы', 'Потеря контекста'],
        finalResult: 'Связанная система привлечения клиентов',
      },
      positioningData: {
        mechanism: 'Единый контекст проекта и последовательная методология',
        differentiation: 'Все этапы маркетинга работают на общей базе',
      },
      expertProfileData: {
        achievements: ['Запущено 20 проектов'],
        antiPreferences: ['Не обещать гарантированную выручку'],
      },
    },
    audienceAvatars: [{
      id: 'avatar-1',
      name: 'Эксперты услуг',
      segment: 'Эксперты услуг',
      subsegment: null,
      profileSummary: 'Самостоятельно развивают свой проект',
      pains: ['Слишком много ручной работы'],
      desires: ['Запускать продукты быстрее'],
      updatedAt: new Date('2026-08-20T10:00:00Z'),
    }],
    jtbdSessions: [{
      id: 'jtbd-1',
      finalJob: 'Собрать маркетинговую систему',
      summary: 'Нужен понятный маршрут запуска',
      updatedAt: new Date('2026-08-20T10:00:00Z'),
    }],
    products: [{
      id: 'product-1',
      type: 'MAIN',
      title: 'Системная воронка',
      format: 'AI SaaS',
      shortDescription: 'Рабочее пространство маркетинга',
      transformation: 'От хаоса к связанной системе',
      offer: 'Соберите маркетинг в одном проекте',
      audienceAvatarId: 'avatar-1',
      jtbdSessionId: 'jtbd-1',
      updatedAt: new Date('2026-08-20T10:00:00Z'),
    }],
    castDevRecords: [{
      id: 'castdev-1',
      analysis: {
        fearsProblemsObjections: [{ title: 'Перегрузка', quote: 'Не успеваю связывать все задачи' }],
        desiresGoalsResults: [{ title: 'Система', quote: 'Хочу видеть весь маркетинг целиком' }],
      },
    }],
    ...overrides,
  };
}

describe('utpFoundationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.caseStudy.findMany.mockResolvedValue([]);
  });

  it('builds a project-owned foundation with deterministic source refs', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture() as never);
    mockedPrisma.caseStudy.findMany.mockResolvedValue([{
      id: 'case-1',
      title: 'Запуск воронки',
      beforeText: 'Не было системы.',
      actionsText: 'Собрали стратегию.',
      afterText: 'Появился стабильный процесс.',
      clientTask: null,
      clientProblem: null,
      desiredResult: null,
      marketingInsight: null,
      updatedAt: new Date('2026-08-21T10:00:00Z'),
    }] as never);

    const { foundation } = await utpFoundationService.buildOwned('user-1', 'project-1');

    expect(mockedPrisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-1', userId: 'user-1' },
    }));
    expect(mockedPrisma.caseStudy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', projectId: 'project-1', status: 'ready' },
    }));
    expect(foundation).toMatchObject({
      version: 1,
      projectId: 'project-1',
      niche: { status: 'ready', source: 'project.niche' },
      audience: { status: 'ready', source: 'strategy.answers.chosenSegment' },
      jtbd: { status: 'ready', source: 'strategy.answers.chosenRequest' },
      product: { status: 'ready', source: 'product:product-1' },
      mechanism: { status: 'ready', source: 'strategy.positioningData.mechanism' },
      differentiation: { status: 'ready', source: 'strategy.positioningData.differentiation' },
    });
    expect(foundation.pains.values.map((item) => item.source)).toContain('audienceAvatar:avatar-1.pains[0]');
    expect(foundation.proofs.values).toContainEqual(expect.objectContaining({
      source: 'caseStudy:case-1.afterText',
    }));
    expect(renderUtpFoundationForPrompt(foundation)).toContain('source: caseStudy:case-1.afterText');
  });

  it('returns an explicit ambiguous state instead of selecting a random segment', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({
      strategyData: { answers: {}, expertProfileData: {} },
      audienceAvatars: [
        { id: 'avatar-a', name: 'Эксперты', segment: 'Эксперты', subsegment: null, profileSummary: null, pains: ['Боль A'], desires: null },
        { id: 'avatar-b', name: 'Команды', segment: 'Команды', subsegment: null, profileSummary: null, pains: ['Боль B'], desires: null },
      ],
      products: [],
      jtbdSessions: [
        { id: 'jtbd-a', finalJob: 'Задача A', summary: null },
        { id: 'jtbd-b', finalJob: 'Задача B', summary: null },
      ],
      castDevRecords: [],
    }) as never);

    const { foundation } = await utpFoundationService.buildOwned('user-1', 'project-1');

    expect(foundation.audience).toMatchObject({
      status: 'missing',
      value: '',
      source: null,
      missingReason: 'ambiguous',
      options: [
        { id: 'avatar-a', label: 'Эксперты' },
        { id: 'avatar-b', label: 'Команды' },
      ],
    });
    expect(foundation.jtbd).toMatchObject({ status: 'missing', missingReason: 'ambiguous' });
    expect(foundation.pains).toMatchObject({ status: 'missing', values: [] });
  });

  it('enforces section, list item and list count limits', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({
      niche: 'Н'.repeat(1_000),
      strategyData: {
        answers: {
          chosenSegment: 'Эксперты услуг',
          corePains: Array.from({ length: 12 }, (_, index) => `${index}-${'Б'.repeat(600)}`),
        },
      },
    }) as never);

    const { foundation } = await utpFoundationService.buildOwned('user-1', 'project-1');

    expect(foundation.niche.value.length).toBeLessThanOrEqual(320);
    expect(foundation.niche.value).toContain('[сокращено]');
    expect(foundation.pains.values).toHaveLength(6);
    expect(foundation.pains.values.every((item) => item.value.length <= 420)).toBe(true);
  });

  it('keeps partial pain evidence but marks fewer than three pains as missing', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({
      strategyData: { answers: { chosenSegment: 'Эксперты услуг', corePains: ['Одна подтверждённая боль'] } },
      audienceAvatars: [],
      jtbdSessions: [],
      products: [],
      castDevRecords: [],
    }) as never);

    const { foundation } = await utpFoundationService.buildOwned('user-1', 'project-1');

    expect(foundation.pains).toMatchObject({
      status: 'missing',
      missingReason: 'not_provided',
      values: [{ value: 'Одна подтверждённая боль', source: 'strategy.answers.corePains[0]' }],
    });
    const rendered = renderUtpFoundationForPrompt(foundation);
    expect(rendered).toContain('Одна подтверждённая боль');
    expect(rendered).toContain('editPath: /app/strategy/audience');
  });

  it('keeps source refs accurate for a supported legacy profile location', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(projectFixture({
      niche: null,
      strategyData: {
        about: {
          niche: 'Legacy-ниша',
          targetAudience: 'Владельцы небольших проектов',
          achievements: ['Подтверждённый факт из профиля'],
        },
      },
      audienceAvatars: [],
      jtbdSessions: [],
      products: [],
      castDevRecords: [],
    }) as never);

    const { foundation } = await utpFoundationService.buildOwned('user-1', 'project-1');

    expect(foundation.niche.source).toBe('strategy.about.niche');
    expect(foundation.audience.source).toBe('strategy.about.targetAudience');
    expect(foundation.proofs.values[0]?.source).toBe('strategy.about.achievements[0]');
  });

  it('does not leak or combine data between two projects of the same user', async () => {
    mockedPrisma.project.findFirst
      .mockResolvedValueOnce(projectFixture({ id: 'project-a', niche: 'Ниша A' }) as never)
      .mockResolvedValueOnce(projectFixture({ id: 'project-b', niche: 'Ниша B' }) as never);

    const first = await utpFoundationService.buildOwned('user-1', 'project-a');
    const second = await utpFoundationService.buildOwned('user-1', 'project-b');

    expect(first.foundation.projectId).toBe('project-a');
    expect(first.foundation.niche.value).toBe('Ниша A');
    expect(second.foundation.projectId).toBe('project-b');
    expect(second.foundation.niche.value).toBe('Ниша B');
    expect(mockedPrisma.project.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'project-b', userId: 'user-1' },
    }));
  });

  it('returns not found when the project does not belong to the authenticated user', async () => {
    mockedPrisma.project.findFirst.mockResolvedValue(null);

    await expect(utpFoundationService.buildOwned('user-2', 'project-1'))
      .rejects.toBeInstanceOf(UtpFoundationNotFoundError);
    expect(mockedPrisma.caseStudy.findMany).not.toHaveBeenCalled();
  });
});
