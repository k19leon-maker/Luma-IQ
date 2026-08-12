import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    project: { findFirst: vi.fn() },
    caseStudy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));

import {
  CaseStudyNotFoundError,
  CaseStudyValidationError,
  caseStudyService,
} from '../../src/services/case-study.service';

const baseCase = {
  id: 'case-1',
  userId: 'user-1',
  projectId: 'project-1',
  title: 'Первые заявки из онлайна',
  beforeText: 'Продажи шли только по рекомендациям.',
  actionsText: 'Собрали позиционирование и воронку.',
  afterText: 'Появились первые заявки из контента.',
  clientTask: null,
  clientProblem: null,
  desiredResult: null,
  marketingInsight: null,
  status: 'draft',
  sourceType: 'manual',
  sourceText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('caseStudyService ownership and readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });
  });

  it('scopes list by authenticated user and project', async () => {
    prismaMock.caseStudy.findMany.mockResolvedValue([baseCase]);

    await caseStudyService.list('user-1', 'project-1', 'draft');

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
      select: { id: true },
    });
    expect(prismaMock.caseStudy.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', projectId: 'project-1', status: 'draft' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('never reads cases when the project is not owned', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    await expect(caseStudyService.list('user-2', 'project-1')).rejects.toBeInstanceOf(CaseStudyNotFoundError);
    expect(prismaMock.caseStudy.findMany).not.toHaveBeenCalled();
  });

  it('scopes direct case access by user, project and case id', async () => {
    prismaMock.caseStudy.findFirst.mockResolvedValue(baseCase);

    await caseStudyService.get('user-1', 'project-1', 'case-1');

    expect(prismaMock.caseStudy.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', projectId: 'project-1', userId: 'user-1' },
    });
  });

  it('derives owner and manual source on create', async () => {
    prismaMock.caseStudy.create.mockResolvedValue(baseCase);

    await caseStudyService.create('user-1', 'project-1', {
      title: 'Первые заявки из онлайна',
      beforeText: '',
      actionsText: '',
      afterText: '',
      clientTask: null,
      clientProblem: null,
      desiredResult: null,
      marketingInsight: null,
      status: 'draft',
    });

    expect(prismaMock.caseStudy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        sourceType: 'manual',
      }),
    });
  });

  it('checks ready state against the merged saved record', async () => {
    prismaMock.caseStudy.findFirst.mockResolvedValue({ ...baseCase, afterText: '' });

    await expect(caseStudyService.update('user-1', 'project-1', 'case-1', {
      status: 'ready',
    })).rejects.toBeInstanceOf(CaseStudyValidationError);
    expect(prismaMock.caseStudy.update).not.toHaveBeenCalled();

    prismaMock.caseStudy.findFirst.mockResolvedValue({ ...baseCase, afterText: '' });
    prismaMock.caseStudy.update.mockResolvedValue({ ...baseCase, status: 'ready' });

    await caseStudyService.update('user-1', 'project-1', 'case-1', {
      afterText: 'Появились заявки.',
      status: 'ready',
    });
    expect(prismaMock.caseStudy.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { afterText: 'Появились заявки.', status: 'ready' },
    });
  });

  it('does not delete a guessed case id', async () => {
    prismaMock.caseStudy.findFirst.mockResolvedValue(null);

    await expect(caseStudyService.remove('user-2', 'project-1', 'case-1'))
      .rejects.toBeInstanceOf(CaseStudyNotFoundError);
    expect(prismaMock.caseStudy.delete).not.toHaveBeenCalled();
  });
});
