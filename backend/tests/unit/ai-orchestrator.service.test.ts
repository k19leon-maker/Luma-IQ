import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  aIGeneration: { findUnique: vi.fn(), update: vi.fn() },
  aIArtifact: { findFirst: vi.fn(), create: vi.fn() },
  aIWorkflowRun: { create: vi.fn(), update: vi.fn() },
}));
const actionResolve = vi.hoisted(() => vi.fn());
const contextBuild = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => vi.fn());
const generationRun = vi.hoisted(() => vi.fn());
const finalize = vi.hoisted(() => vi.fn());
const failDeferred = vi.hoisted(() => vi.fn());
const pipelineRun = vi.hoisted(() => vi.fn());
const structuredSave = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../src/services/ai-action-registry.service', () => ({
  aiActionRegistryService: { resolve: actionResolve },
}));
vi.mock('../../src/services/context-builder.service', () => ({
  contextBuilderService: { build: contextBuild },
}));
vi.mock('../../src/services/model-router.service', () => ({
  modelRouterService: { routeForAttempt: route },
}));
vi.mock('../../src/services/ai-generation.service', () => ({
  aiGenerationService: {
    run: generationRun,
    finalizeDeferredAiPoints: finalize,
    failDeferredAiPoints: failDeferred,
  },
}));
vi.mock('../../src/services/pipeline-runner.service', () => ({
  pipelineRunnerService: { run: pipelineRun },
}));
vi.mock('../../src/services/structured-output.service', () => ({
  structuredOutputService: { save: structuredSave },
}));
vi.mock('../../src/services/ai.service', () => ({
  chat: vi.fn(),
}));

import { aiOrchestratorService } from '../../src/services/ai-orchestrator.service';

describe('aiOrchestratorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });
    prismaMock.aIGeneration.findUnique.mockResolvedValue(null);
    prismaMock.aIWorkflowRun.create.mockResolvedValue({ id: 'run-1' });
    prismaMock.aIWorkflowRun.update.mockResolvedValue({});
    prismaMock.aIArtifact.create.mockResolvedValue({
      id: 'artifact-final',
      title: 'Final',
      content: 'Final content',
      structured: { result: true },
    });
    actionResolve.mockResolvedValue({
      actionKey: 'content_post',
      pipeline: [{ stage: 'generate', modelAlias: 'LUNA', reasoning: 'low' }],
      contextBudget: 8_000,
      outputLimit: 2_000,
      retryPolicy: { maxAttempts: 2, retrySameProfile: true },
      fallbackPolicy: { aliases: ['SOL'], allowDowngrade: false },
      batchEligible: false,
      aiPoints: 5,
      definitionVersionId: 'definition-1',
      pricingVersionId: 'pricing-1',
      source: 'database',
    });
    contextBuild.mockResolvedValue({
      bundle: { contextVersion: 'context-v1' },
      compactJson: { contextVersion: 'context-v1', blocks: [] },
      summaryId: 'summary-1',
      summaryVersion: 1,
      sourceHash: 'source-hash',
      promptCacheKey: 'prompt:key',
      cacheHit: false,
      compressed: false,
      sourceTokens: 100,
      approxTokens: 100,
      droppedBlockKeys: [],
    });
    route.mockResolvedValue({
      stage: 'generate',
      requestedAlias: 'LUNA',
      selectedAlias: 'LUNA',
      provider: 'OPENAI',
      actualModelId: 'model-luna',
      profileVersionId: 'model-version',
      profileSource: 'database',
      fallback: false,
      downgrade: false,
      reason: 'primary',
      candidateIndex: 0,
    });
    pipelineRun.mockResolvedValue({
      finalContent: 'Final content',
      finalStructured: { result: true },
      stageArtifacts: ['stage-artifact'],
      stageSteps: ['stage-step'],
      routeDecisions: [],
      finalRoute: {
        stage: 'generate',
        requestedAlias: 'LUNA',
        selectedAlias: 'LUNA',
        provider: 'OPENAI',
        actualModelId: 'model-luna',
        profileVersionId: 'model-version',
        profileSource: 'database',
        fallback: false,
        downgrade: false,
        reason: 'primary',
        candidateIndex: 0,
      },
      mock: false,
    });
    generationRun.mockImplementation(async ({ execute }) => {
      const executed = await execute({ generationId: 'generation-1' });
      return {
        result: executed.result,
        generationId: 'generation-1',
        aiPointsPending: true,
        aiPointsCharged: 0,
        aiBalanceRemaining: 95,
        creditsCharged: 0,
        actualCostUsd: '0.01',
      };
    });
    structuredSave.mockResolvedValue({});
    finalize.mockResolvedValue({ aiPointsCharged: 5, aiBalanceRemaining: 95 });
    failDeferred.mockResolvedValue(undefined);
  });

  it('persists the final artifact before capturing the single user charge', async () => {
    const result = await aiOrchestratorService.run({
      userId: 'user-1',
      projectId: 'project-1',
      actionKey: 'content_post',
      featureCode: 'post',
      workflow: 'posts.generate',
      inputs: { topic: 'Test' },
      promptVersion: 'v1',
      artifactType: 'post',
      buildStagePrompt: () => ({ systemPrompt: 'System', userPrompt: 'User' }),
    });

    expect(result).toMatchObject({
      artifactId: 'artifact-final',
      aiPointsCharged: 5,
      aiBalanceRemaining: 95,
    });
    expect(prismaMock.aIArtifact.create).toHaveBeenCalled();
    expect(generationRun).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: 'content_post',
      featureCode: 'post',
    }));
    expect(structuredSave).toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith({
      generationId: 'generation-1',
      userId: 'user-1',
    });
    expect(structuredSave.mock.invocationCallOrder[0]).toBeLessThan(finalize.mock.invocationCallOrder[0]);
  });

  it('releases reserved points and creates no final artifact when final validation fails', async () => {
    await expect(aiOrchestratorService.run({
      userId: 'user-1',
      projectId: 'project-1',
      actionKey: 'content_post',
      featureCode: 'post',
      workflow: 'posts.generate',
      inputs: { topic: 'Test' },
      promptVersion: 'v1',
      artifactType: 'post',
      validationRules: { minLength: 10_000 },
      buildStagePrompt: () => ({ systemPrompt: 'System', userPrompt: 'User' }),
    })).rejects.toThrow('FINAL_VALIDATION_FAILED');

    expect(prismaMock.aIArtifact.create).not.toHaveBeenCalled();
    expect(structuredSave).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(failDeferred).toHaveBeenCalledWith(expect.objectContaining({
      generationId: 'generation-1',
      userId: 'user-1',
    }));
    expect(prismaMock.aIWorkflowRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });

  it('releases one reserved UTP charge when grounding validation rejects the final JSON', async () => {
    const section = (value: string, source: string) => ({
      status: 'ready', value, source, editPath: '/app/strategy/about',
    });
    const foundation = {
      version: 1,
      projectId: 'project-1',
      niche: section('Консалтинг', 'project.niche'),
      audience: section('Эксперты', 'strategy.answers.chosenSegment'),
      jtbd: section('Собрать систему', 'strategy.answers.chosenRequest'),
      pains: { status: 'ready', values: [{ value: 'Нет системы', source: 'strategy.answers.corePains[0]' }], editPath: '/app/strategy/audience' },
      desiredOutcome: section('Понятный процесс', 'strategy.answers.finalResult'),
      product: section('Программа', 'product:product-1'),
      mechanism: section('Методика', 'strategy.positioningData.mechanism'),
      differentiation: section('Связанные решения', 'strategy.positioningData.differentiation'),
      proofs: { status: 'ready', values: [{ value: 'Клиент наладил процесс', source: 'caseStudy:case-1.afterText' }], editPath: '/app/strategy/cases' },
      constraints: { status: 'ready', values: [{ value: 'Без гарантий', source: 'strategy.expertProfileData.antiPreferences[0]' }], editPath: '/app/strategy/about' },
    };
    const usp = 'Программа помогает экспертам собрать систему за 30 дней. '
      + 'Она связывает задачу клиента, продукт и последовательную методику в один понятный процесс. '.repeat(7);
    const finalStructured = {
      usp,
      usedEvidence: [{ key: 'niche', label: 'Ниша', source: 'project.niche' }],
      missingData: [],
    };
    contextBuild.mockResolvedValueOnce({
      bundle: { contextVersion: 'utp-foundation-v1', utpFoundation: foundation },
      compactJson: { contextVersion: 'utp-foundation-v1', blocks: [] },
      summaryId: 'summary-utp',
      summaryVersion: 1,
      sourceHash: 'source-utp',
      promptCacheKey: 'prompt:utp',
      cacheHit: false,
      compressed: false,
      sourceTokens: 100,
      approxTokens: 100,
      droppedBlockKeys: [],
    });
    pipelineRun.mockResolvedValueOnce({
      finalContent: JSON.stringify(finalStructured),
      finalStructured,
      stageArtifacts: ['stage-artifact'],
      stageSteps: ['stage-step'],
      routeDecisions: [],
      finalRoute: {
        stage: 'generate',
        requestedAlias: 'LUNA',
        selectedAlias: 'LUNA',
        provider: 'OPENAI',
        actualModelId: 'model-luna',
        profileVersionId: 'model-version',
        profileSource: 'database',
        fallback: false,
        downgrade: false,
        reason: 'primary',
        candidateIndex: 0,
      },
      mock: false,
    });

    await expect(aiOrchestratorService.run({
      userId: 'user-1',
      projectId: 'project-1',
      actionKey: 'utp',
      featureCode: 'utp',
      workflow: 'strategy.utp',
      inputs: {},
      promptVersion: 'v2',
      artifactType: 'utp',
      validationRules: { minLength: 500, maxLength: 8_000, structuredOutput: 'json' },
      buildStagePrompt: () => ({ systemPrompt: 'System', userPrompt: 'User' }),
    })).rejects.toThrow('number "30" is not grounded');

    expect(prismaMock.aIArtifact.create).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(failDeferred).toHaveBeenCalledTimes(1);
    expect(failDeferred).toHaveBeenCalledWith(expect.objectContaining({
      generationId: 'generation-1',
      userId: 'user-1',
    }));
  });
});
