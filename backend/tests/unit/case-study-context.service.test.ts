import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    caseStudy: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { caseStudyContextService } from '../../src/services/case-study-context.service';

const mockedPrisma = vi.mocked(prisma, true);

function readyCase(index: number, text = 'Результат') {
  return {
    id: `case-${index}`,
    title: `Кейс ${index}`,
    beforeText: `До ${index}`,
    actionsText: `Действия ${index}`,
    afterText: text,
    clientTask: null,
    clientProblem: null,
    desiredResult: null,
    marketingInsight: null,
    updatedAt: new Date(`2026-08-${String(12 - index).padStart(2, '0')}T10:00:00Z`),
  };
}

describe('caseStudyContextService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries at most five freshest ready cases inside the current owner and project', async () => {
    mockedPrisma.caseStudy.findMany.mockResolvedValue([readyCase(1)] as never);

    await caseStudyContextService.getReadyCasesForProject('user-1', 'project-1', 99);

    expect(mockedPrisma.caseStudy.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', projectId: 'project-1', status: 'ready' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: {
        id: true,
        title: true,
        beforeText: true,
        actionsText: true,
        afterText: true,
        clientTask: true,
        clientProblem: true,
        desiredResult: true,
        marketingInsight: true,
        updatedAt: true,
      },
    });
  });

  it('bounds fields and the complete prompt block', async () => {
    mockedPrisma.caseStudy.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => readyCase(index + 1, 'A'.repeat(8_000))) as never,
    );

    const cases = await caseStudyContextService.getReadyCasesForProject('user-1', 'project-1');
    const rendered = caseStudyContextService.renderForPrompt(cases);

    expect(cases).toHaveLength(5);
    expect(rendered.length).toBeLessThanOrEqual(9_000);
    expect(rendered).toContain('[сокращено]');
    expect(rendered).toContain('не придумывай цитаты');
  });
});
