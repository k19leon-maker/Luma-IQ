import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/feature-pricing.service', () => ({
  featurePricingService: {
    resolve: vi.fn(() => Promise.resolve({
      featureCode: 'ai_chat',
      featureGroup: 'chat',
      generationClass: 'LIGHT',
      creditPrice: 1,
    })),
    calculateCredits: vi.fn(() => 1),
  },
}));

vi.mock('../../src/services/access-policy.service', () => ({
  accessPolicyService: {
    assertCanUseFeature: vi.fn(() => Promise.resolve({
      user: { id: 'user-1', role: 'USER', _count: { projects: 1 } },
      plan: 'PRO',
      limits: { monthlyCredits: 3000 },
      billingPeriod: { id: 'period-1' },
      allowed: true,
      requiredCredits: 1,
    })),
  },
  AccessPolicyError: class AccessPolicyError extends Error {},
}));

vi.mock('../../src/services/billing-period.service', () => ({
  billingPeriodService: {
    getOrCreateCurrent: vi.fn(() => Promise.resolve({ id: 'period-1' })),
  },
}));

vi.mock('../../src/services/credit-ledger.service', () => ({
  creditLedgerService: {
    reserve: vi.fn(() => Promise.resolve()),
    refund: vi.fn(() => Promise.resolve()),
    consume: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../src/services/ai-cost.service', () => ({
  aiCostService: {
    assertPricingExists: vi.fn(() => Promise.resolve()),
    calculate: vi.fn(() => Promise.resolve({ actualCostUsd: '0.01', pricingSnapshot: { model: 'gpt-5.4' } })),
  },
  MissingModelPricingError: class MissingModelPricingError extends Error {},
}));

const prismaMock = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn(() => Promise.resolve(null)) },
  billingPeriod: { update: vi.fn(() => Promise.resolve()) },
  project: { findFirst: vi.fn(() => Promise.resolve({ id: 'project-1' })) },
  aIGeneration: {
    findUnique: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(({ data }) => Promise.resolve({ id: 'generation-1', ...data })),
    update: vi.fn(() => Promise.resolve()),
    findFirst: vi.fn(() => Promise.resolve({ creditsReserved: 1 })),
    findMany: vi.fn(() => Promise.resolve([{ featureCode: 'ai_chat', metadata: null }])),
  },
  aIUsageEvent: { create: vi.fn(() => Promise.resolve()) },
  featureUsageDaily: { upsert: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));

import { aiGenerationService } from '../../src/services/ai-generation.service';

describe('AI accounting integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates generation, executes provider and marks success', async () => {
    const result = await aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'ai_chat',
      provider: 'OPENAI',
      model: 'gpt-5.4',
      execute: async () => ({
        result: { content: 'hello' },
        usage: { inputTokens: 10, outputTokens: 20 },
        provider: 'OPENAI',
        model: 'gpt-5.4',
      }),
    });

    expect(result.generationId).toBe('generation-1');
    expect(prismaMock.aIGeneration.create).toHaveBeenCalled();
    expect(prismaMock.aIGeneration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    }));
  });

  it('does not charge successful usage when provider execution fails', async () => {
    await expect(aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'ai_chat',
      provider: 'OPENAI',
      model: 'gpt-5.4',
      execute: async () => {
        throw new Error('provider failed');
      },
    })).rejects.toThrow('provider failed');

    expect(prismaMock.billingPeriod.update).not.toHaveBeenCalled();
    expect(prismaMock.aIGeneration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });

  it('does not create or charge a second generation for a completed idempotency key', async () => {
    prismaMock.aIGeneration.findUnique.mockResolvedValueOnce({
      id: 'generation-existing',
      status: 'SUCCEEDED',
    } as never);

    await expect(aiGenerationService.run({
      userId: 'user-1',
      projectId: 'project-1',
      featureCode: 'ai_chat',
      provider: 'OPENAI',
      model: 'gpt-5.4',
      idempotencyKey: 'same-request',
      execute: async () => ({
        result: { content: 'should not run' },
        usage: { inputTokens: 10, outputTokens: 20 },
        provider: 'OPENAI',
        model: 'gpt-5.4',
      }),
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY' });

    expect(prismaMock.aIGeneration.create).not.toHaveBeenCalled();
    expect(prismaMock.billingPeriod.update).not.toHaveBeenCalled();
  });
});
