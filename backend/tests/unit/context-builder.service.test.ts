import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIActionDefinition } from '../../src/config/ai-action-registry';

const contextMock = vi.hoisted(() => vi.fn());
const summaryStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../src/services/project-context.service', () => ({
  projectContextService: { build: contextMock },
}));
vi.mock('../../src/lib/prisma', () => ({
  prisma: { aIContextSummary: summaryStore },
}));

import { contextBuilderService } from '../../src/services/context-builder.service';

const definition: AIActionDefinition = {
  actionKey: 'content_post',
  pipeline: [{ stage: 'generate', modelAlias: 'LUNA', reasoning: 'low' }],
  contextBudget: 100,
  outputLimit: 1_000,
  retryPolicy: { maxAttempts: 2, retrySameProfile: true },
  fallbackPolicy: { aliases: ['SOL'], allowDowngrade: false },
  batchEligible: false,
  aiPoints: 5,
};

describe('contextBuilderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextMock.mockResolvedValue({
      projectId: 'project-1',
      projectName: 'Project',
      workflow: 'posts',
      step: 'generate',
      contextVersion: 'project-context-v2',
      base: {},
      blocks: [
        { key: 'project', title: 'Проект', priority: 'critical', content: 'A'.repeat(500) },
        { key: 'history', title: 'История', priority: 'low', content: 'B'.repeat(500) },
      ],
      rendered: '',
      approxTokens: 250,
    });
    summaryStore.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 2 });
    summaryStore.create.mockImplementation(async ({ data }) => ({ id: 'summary-1', ...data }));
  });

  it('compresses by action budget and stores a versioned summary with stable cache key', async () => {
    const first = await contextBuilderService.build({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'posts',
      step: 'generate',
      actionKey: 'content_post',
      actionDefinition: definition,
      inputs: { topic: 'Test' },
      promptVersion: 'v1',
    });

    expect(first.compressed).toBe(true);
    expect(first.approxTokens).toBeLessThanOrEqual(130);
    expect(first.promptCacheKey).toMatch(/^prompt:/);
    expect(summaryStore.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version: 3,
        compressed: true,
        contextVersion: 'project-context-v2',
      }),
    }));
  });

  it('changes source hash when a context source fingerprint changes', async () => {
    summaryStore.findFirst.mockReset().mockResolvedValue(null);
    summaryStore.create.mockReset().mockResolvedValue(null);
    contextMock
      .mockResolvedValueOnce({
        projectId: 'project-1',
        projectName: 'Project',
        workflow: 'posts',
        step: 'generate',
        contextVersion: 'project-context-v3',
        base: {},
        blocks: [{
          key: 'cases_summary',
          title: 'Готовые кейсы',
          priority: 'low',
          content: 'Тот же текст кейса',
          sourceFingerprint: 'case-1:2026-08-12T10:00:00.000Z',
        }],
        rendered: '',
        approxTokens: 5,
      })
      .mockResolvedValueOnce({
        projectId: 'project-1',
        projectName: 'Project',
        workflow: 'posts',
        step: 'generate',
        contextVersion: 'project-context-v3',
        base: {},
        blocks: [{
          key: 'cases_summary',
          title: 'Готовые кейсы',
          priority: 'low',
          content: 'Тот же текст кейса',
          sourceFingerprint: 'case-2:2026-08-12T10:00:00.000Z',
        }],
        rendered: '',
        approxTokens: 5,
      });

    const input = {
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'posts',
      step: 'generate',
      actionKey: 'content_post' as const,
      actionDefinition: definition,
      inputs: { topic: 'Test' },
      promptVersion: 'v1',
    };
    const first = await contextBuilderService.build(input);
    const second = await contextBuilderService.build(input);

    expect(first.sourceHash).not.toBe(second.sourceHash);
    expect(first.promptCacheKey).not.toBe(second.promptCacheKey);
  });
});
