import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIActionDefinition } from '../../src/config/ai-action-registry';

const prismaMock = vi.hoisted(() => ({
  aIWorkflowStep: {
    create: vi.fn(),
    update: vi.fn(() => Promise.resolve({})),
  },
  aIArtifact: {
    create: vi.fn(),
  },
}));
const routeMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../src/services/model-router.service', () => ({
  modelRouterService: { routeForAttempt: routeMock },
}));

import { pipelineRunnerService } from '../../src/services/pipeline-runner.service';

const definition: AIActionDefinition = {
  actionKey: 'content_article',
  pipeline: [
    { stage: 'outline', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 1_000 },
    { stage: 'draft', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 3_000 },
  ],
  contextBudget: 10_000,
  outputLimit: 4_000,
  retryPolicy: { maxAttempts: 2, retrySameProfile: true },
  fallbackPolicy: { aliases: [], allowDowngrade: false },
  batchEligible: false,
  aiPoints: 30,
};

describe('pipelineRunnerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let step = 0;
    let artifact = 0;
    prismaMock.aIWorkflowStep.create.mockImplementation(async () => ({ id: `step-${++step}` }));
    prismaMock.aIArtifact.create.mockImplementation(async () => ({ id: `artifact-${++artifact}` }));
    routeMock.mockImplementation(async ({ stage, attemptIndex }) => ({
      stage: stage.stage,
      requestedAlias: stage.modelAlias,
      selectedAlias: stage.modelAlias,
      provider: 'OPENAI',
      actualModelId: `model-${stage.modelAlias}`,
      profileVersionId: null,
      profileSource: 'environment',
      fallback: false,
      downgrade: false,
      reason: attemptIndex ? 'same_profile_retry' : 'primary',
      candidateIndex: attemptIndex,
    }));
  });

  it('retries only the failed stage and passes compact JSON to the next stage', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ content: '{"headings":["One","Two"]}' })
      .mockResolvedValueOnce({ content: 'Final article' });

    const result = await pipelineRunnerService.run({
      userId: 'user-1',
      projectId: 'project-1',
      workflowRunId: 'run-1',
      generationId: 'generation-1',
      workflow: 'article.pipeline',
      definition,
      initialPayload: { source: 'raw input' },
      executeStage: execute,
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.map(([input]) => input.outputLimit)).toEqual([1_000, 1_000, 3_000]);
    expect(execute.mock.calls[2][0].payload).toEqual({
      previousStage: 'outline',
      result: { headings: ['One', 'Two'] },
    });
    expect(result.finalContent).toBe('Final article');
    expect(result.stageArtifacts).toHaveLength(2);
    expect(prismaMock.aIWorkflowStep.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
    expect(prismaMock.aIWorkflowStep.create.mock.calls[0][0].data.input.outputLimit).toBe(1_000);
    expect(prismaMock.aIWorkflowStep.create.mock.calls[2][0].data.input.outputLimit).toBe(3_000);
  });
});
