import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  aIGeneration: {
    findUnique: vi.fn(),
    create: vi.fn(({ data }) => Promise.resolve({ id: 'generation-1', ...data })),
    update: vi.fn(() => Promise.resolve({})),
  },
  aIUsageEvent: {
    create: vi.fn(() => Promise.resolve({})),
  },
  billingPeriod: {
    update: vi.fn(() => Promise.resolve({})),
  },
}));

const pointLedgerMock = vi.hoisted(() => ({
  reserve: vi.fn(() => Promise.resolve({ id: 'reserve-1' })),
  getState: vi.fn(() => Promise.resolve({
    balance: 100,
    reserved: 20,
    available: 80,
  })),
  captureWithPersistence: vi.fn(async (_input, persist) => {
    await persist(prismaMock, 20);
    return { id: 'capture-1', quantity: 20, availableAfter: 80 };
  }),
  release: vi.fn(() => Promise.resolve({ id: 'release-1' })),
}));

const legacyLedgerMock = vi.hoisted(() => ({
  reserve: vi.fn(),
  consume: vi.fn(),
  refund: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../src/services/ai-feature-flags.service', () => ({
  aiFeatureFlagsService: { isEnabled: vi.fn(() => Promise.resolve(true)) },
}));
vi.mock('../../src/services/ai-point-ledger.service', () => ({
  aiPointLedgerService: pointLedgerMock,
}));
vi.mock('../../src/services/credit-ledger.service', () => ({
  creditLedgerService: legacyLedgerMock,
}));
vi.mock('../../src/services/ai-balance.service', () => ({
  aiBalanceService: {
    resolvePointsForGeneration: vi.fn((input: { featureCode: string }) => Promise.resolve(({
      instagram_profile_generate: 15,
      instagram_profile_improve: 5,
      instagram_highlights_generate: 40,
      instagram_highlight_scenario_generate: 20,
      instagram_highlight_improve: 10,
      instagram_story_improve: 3,
      tg_channel_description_generate: 5,
      tg_channel_description_improve: 2,
      tg_channel_idea_improve: 2,
    } as Record<string, number>)[input.featureCode] ?? 20)),
  },
}));
vi.mock('../../src/services/feature-pricing.service', () => ({
  featurePricingService: {
    resolve: vi.fn(() => Promise.resolve({
      featureCode: 'positioning',
      featureGroup: 'strategy',
      generationClass: 'MEDIUM',
      creditPrice: 99,
    })),
    calculateCredits: vi.fn(() => 99),
  },
}));
vi.mock('../../src/services/access-policy.service', () => ({
  accessPolicyService: {
    assertCanUseFeature: vi.fn(() => Promise.resolve({
      user: { id: 'user-1', role: 'USER' },
      limits: { monthlyCredits: 100 },
      billingPeriod: { id: 'period-1' },
    })),
  },
}));
vi.mock('../../src/services/ai-cost.service', () => ({
  aiCostService: {
    assertPricingExists: vi.fn(() => Promise.resolve()),
    calculate: vi.fn(() => Promise.resolve({
      actualCostUsd: { toString: () => '0.01' },
      pricingSnapshot: { model: 'gpt-5.6-luna' },
    })),
  },
  MissingModelPricingError: class MissingModelPricingError extends Error {},
}));
vi.mock('../../src/services/provider-call-accounting.service', () => ({
  providerCallAccountingService: {
    aggregateForGeneration: vi.fn(() => Promise.resolve(null)),
  },
}));

import { aiGenerationService } from '../../src/services/ai-generation.service';

describe('AI points V2 generation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.aIGeneration.findUnique.mockResolvedValue(null);
  });

  it('reserves once and captures only after successful result persistence', async () => {
    const result = await aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'positioning',
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      idempotencyKey: 'request-1',
      execute: async () => ({
        result: 'ready',
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    });

    expect(pointLedgerMock.reserve).toHaveBeenCalledWith(expect.objectContaining({
      generationId: 'generation-1',
      points: 20,
      idempotencyKey: 'request-1',
    }));
    expect(pointLedgerMock.captureWithPersistence).toHaveBeenCalled();
    expect(legacyLedgerMock.reserve).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      aiPointsCharged: 20,
      aiBalanceRemaining: 80,
      creditsCharged: 0,
    });
  });

  it('releases the reservation when provider execution fails', async () => {
    await expect(aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'positioning',
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      execute: async () => {
        throw new Error('provider failed');
      },
    })).rejects.toThrow('provider failed');

    expect(pointLedgerMock.reserve).toHaveBeenCalled();
    expect(pointLedgerMock.release).toHaveBeenCalled();
    expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
  });

  it('does not call the provider when the AI balance is insufficient', async () => {
    const execute = vi.fn();
    pointLedgerMock.reserve.mockRejectedValueOnce(Object.assign(
      new Error('AI-баланс закончился'),
      { code: 'AI_BALANCE_EXHAUSTED', status: 402 },
    ));

    await expect(aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'positioning',
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      execute,
    })).rejects.toMatchObject({ code: 'AI_BALANCE_EXHAUSTED' });

    expect(execute).not.toHaveBeenCalled();
    expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
  });

  it('releases the reservation when the strict SOL stage is unavailable', async () => {
    await expect(aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'positioning',
      actionKey: 'positioning',
      provider: 'OPENAI',
      model: 'model-sol',
      execute: async () => {
        throw Object.assign(new Error('SOL_UNAVAILABLE'), { code: 'SOL_UNAVAILABLE' });
      },
    })).rejects.toMatchObject({ code: 'SOL_UNAVAILABLE' });

    expect(pointLedgerMock.reserve).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: 'positioning',
    }));
    expect(pointLedgerMock.release).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: 'positioning',
    }));
    expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
    expect(prismaMock.aIGeneration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', errorMessage: 'SOL_UNAVAILABLE' }),
    }));
  });

  it('keeps workflow points reserved until the result artifact is persisted', async () => {
    const result = await aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'positioning',
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      deferAiPointCapture: true,
      execute: async () => ({
        result: 'ready for artifact persistence',
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    });

    expect(pointLedgerMock.reserve).toHaveBeenCalled();
    expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
    expect(prismaMock.aIGeneration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RUNNING',
        errorCode: 'AWAITING_RESULT_PERSISTENCE',
        aiPointsCaptured: 0,
      }),
    }));
    expect(result).toMatchObject({
      aiPointsCharged: 0,
      aiBalanceRemaining: 80,
      aiPointsPending: true,
    });
  });

  it('does not reserve or execute again for a completed idempotency key', async () => {
    prismaMock.aIGeneration.findUnique.mockResolvedValueOnce({
      id: 'generation-existing',
      status: 'SUCCEEDED',
    });
    const execute = vi.fn();

    await expect(aiGenerationService.run({
      userId: 'user-1',
      featureCode: 'positioning',
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      idempotencyKey: 'request-1',
      execute,
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY' });

    expect(pointLedgerMock.reserve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  describe('Instagram profile billing regressions', () => {
    it('reserves the backend-owned generation price and releases it after provider failure', async () => {
      await expect(aiGenerationService.run({
        userId: 'user-1',
        projectId: 'project-1',
        featureCode: 'instagram_profile_generate',
        actionKey: 'instagram_profile_generate',
        provider: 'OPENAI',
        model: 'gpt-5.6-luna',
        idempotencyKey: 'instagram-provider-error',
        execute: async () => {
          throw new Error('instagram provider failed');
        },
      })).rejects.toThrow('instagram provider failed');

      expect(pointLedgerMock.reserve).toHaveBeenCalledWith(expect.objectContaining({
        actionKey: 'instagram_profile_generate',
        points: 15,
        idempotencyKey: 'instagram-provider-error',
      }));
      expect(pointLedgerMock.release).toHaveBeenCalledWith(expect.objectContaining({
        actionKey: 'instagram_profile_generate',
      }));
      expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
    });

    it('does not call the provider or capture points when the Instagram balance is insufficient', async () => {
      const execute = vi.fn();
      pointLedgerMock.reserve.mockRejectedValueOnce(Object.assign(
        new Error('AI-баланс закончился'),
        { code: 'AI_BALANCE_EXHAUSTED', status: 402 },
      ));

      await expect(aiGenerationService.run({
        userId: 'user-1',
        projectId: 'project-1',
        featureCode: 'instagram_profile_improve',
        actionKey: 'instagram_profile_improve',
        provider: 'OPENAI',
        model: 'gpt-5.6-luna',
        idempotencyKey: 'instagram-no-balance',
        execute,
      })).rejects.toMatchObject({ code: 'AI_BALANCE_EXHAUSTED' });

      expect(execute).not.toHaveBeenCalled();
      expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
    });

    it('does not reserve or execute a repeated completed Instagram request', async () => {
      prismaMock.aIGeneration.findUnique.mockResolvedValueOnce({
        id: 'instagram-existing',
        status: 'SUCCEEDED',
      });
      const execute = vi.fn();

      await expect(aiGenerationService.run({
        userId: 'user-1',
        projectId: 'project-1',
        featureCode: 'instagram_profile_generate',
        actionKey: 'instagram_profile_generate',
        provider: 'OPENAI',
        model: 'gpt-5.6-luna',
        idempotencyKey: 'instagram-repeat',
        execute,
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY' });

      expect(pointLedgerMock.reserve).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('does not charge a repeated completed Telegram description request', async () => {
      prismaMock.aIGeneration.findUnique.mockResolvedValueOnce({
        id: 'tg-description-existing',
        status: 'SUCCEEDED',
      });
      const execute = vi.fn();

      await expect(aiGenerationService.run({
        userId: 'user-1',
        projectId: 'project-1',
        featureCode: 'tg_channel_description_generate',
        actionKey: 'tg_channel_description_generate',
        provider: 'OPENAI',
        model: 'gpt-5.6-luna',
        idempotencyKey: 'tg-description-repeat',
        execute,
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY' });

      expect(pointLedgerMock.reserve).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it.each([
      ['tg_channel_description_generate', 5],
      ['tg_channel_description_improve', 2],
      ['tg_channel_idea_improve', 2],
      ['instagram_highlights_generate', 40],
      ['instagram_highlight_scenario_generate', 20],
      ['instagram_highlight_improve', 10],
      ['instagram_story_improve', 3],
    ] as const)('uses a separate backend price for %s', async (actionKey, points) => {
      await expect(aiGenerationService.run({
        userId: 'user-1',
        projectId: 'project-1',
        featureCode: actionKey,
        actionKey,
        provider: 'OPENAI',
        model: 'gpt-5.6-luna',
        idempotencyKey: `billing-${actionKey}`,
        execute: async () => {
          throw new Error('provider failed');
        },
      })).rejects.toThrow('provider failed');

      expect(pointLedgerMock.reserve).toHaveBeenCalledWith(expect.objectContaining({
        actionKey,
        points,
      }));
      expect(pointLedgerMock.release).toHaveBeenCalledWith(expect.objectContaining({ actionKey }));
      expect(pointLedgerMock.captureWithPersistence).not.toHaveBeenCalled();
    });
  });
});
