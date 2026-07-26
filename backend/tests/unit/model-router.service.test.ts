import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIActionDefinition } from '../../src/config/ai-action-registry';

const resolveMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/model-registry.service', () => ({
  modelRegistryService: { resolve: resolveMock },
}));

import { modelRouterService } from '../../src/services/model-router.service';

const definition: AIActionDefinition = {
  actionKey: 'positioning',
  pipeline: [{ stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium' }],
  contextBudget: 20_000,
  outputLimit: 5_000,
  retryPolicy: { maxAttempts: 2, retrySameProfile: true },
  fallbackPolicy: { aliases: ['SOL'], allowDowngrade: false },
  batchEligible: false,
  aiPoints: 20,
};

describe('modelRouterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMock.mockImplementation(async (alias: string) => ({
      alias,
      provider: 'OPENAI',
      actualModelId: `model-${alias.toLowerCase()}`,
      source: 'database',
      versionId: `version-${alias}`,
      validFrom: new Date(),
    }));
  });

  it('retries the same profile before using an explicit higher-quality fallback', async () => {
    const primary = await modelRouterService.routeForAttempt({
      definition,
      stage: definition.pipeline[0],
      attemptIndex: 0,
    });
    const retry = await modelRouterService.routeForAttempt({
      definition,
      stage: definition.pipeline[0],
      attemptIndex: 1,
    });
    const fallback = await modelRouterService.routeForAttempt({
      definition,
      stage: definition.pipeline[0],
      attemptIndex: 2,
    });

    expect(primary).toMatchObject({ selectedAlias: 'TERRA', reason: 'primary', fallback: false });
    expect(retry).toMatchObject({ selectedAlias: 'TERRA', reason: 'same_profile_retry', fallback: false });
    expect(fallback).toMatchObject({ selectedAlias: 'SOL', reason: 'explicit_fallback', fallback: true, downgrade: false });
  });

  it('blocks an undeclared quality downgrade', async () => {
    await expect(modelRouterService.routeForAttempt({
      definition: {
        ...definition,
        fallbackPolicy: { aliases: ['LUNA'], allowDowngrade: false },
      },
      stage: definition.pipeline[0],
      attemptIndex: 2,
    })).rejects.toMatchObject({ code: 'MODEL_DOWNGRADE_BLOCKED' });
  });

  it('never falls back from a strict SOL strategic stage', async () => {
    const strictDefinition: AIActionDefinition = {
      ...definition,
      pipeline: [{ stage: 'decision', modelAlias: 'SOL', reasoning: 'medium' }],
      fallbackPolicy: { aliases: [], allowDowngrade: false },
    };
    const stage = strictDefinition.pipeline[0];

    expect(modelRouterService.listCandidates(strictDefinition, stage)).toEqual(['SOL']);
    await expect(modelRouterService.routeForAttempt({
      definition: strictDefinition,
      stage,
      attemptIndex: 2,
    })).rejects.toMatchObject({ code: 'MODEL_ROUTE_EXHAUSTED' });
  });
});
