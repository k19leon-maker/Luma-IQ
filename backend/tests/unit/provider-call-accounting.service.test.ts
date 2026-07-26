import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerCallStore = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: { aIProviderCall: providerCallStore },
}));

vi.mock('../../src/services/ai-cost.service', () => ({
  aiCostService: {
    calculate: vi.fn(async () => ({
      actualCostUsd: new Prisma.Decimal('0.125'),
      pricingSnapshot: { model: 'gpt-5.6-luna', validFrom: '2026-07-26T00:00:00.000Z' },
    })),
  },
}));

import { providerCallAccountingService } from '../../src/services/provider-call-accounting.service';

describe('providerCallAccountingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerCallStore.create.mockResolvedValue({ id: 'call-1' });
    providerCallStore.update.mockResolvedValue({});
    providerCallStore.updateMany.mockResolvedValue({ count: 1 });
  });

  it('records response, usage, pricing and retry metadata', async () => {
    const result = await providerCallAccountingService.execute({
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      telemetry: {
        generationId: 'generation-1',
        actionKey: 'ai_chat',
        pipeline: 'chat',
        stage: 'answer',
        modelAlias: 'LUNA',
        retryIndex: 1,
      },
      execute: async () => ({
        result: 'ok',
        responseId: 'resp-1',
        usage: {
          inputTokens: 100,
          cachedInputTokens: 20,
          outputTokens: 50,
          reasoningTokens: 10,
        },
      }),
    });

    expect(result.providerCallId).toBe('call-1');
    expect(providerCallStore.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        responseId: 'resp-1',
        status: 'SUCCEEDED',
        cachedInputTokens: 20,
        reasoningTokens: 10,
        costUsd: new Prisma.Decimal('0.125'),
      }),
    }));
  });

  it('records a failed provider call without converting it to success', async () => {
    await expect(providerCallAccountingService.execute({
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      telemetry: { actionKey: 'ai_chat', stage: 'answer' },
      execute: async () => {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      },
    })).rejects.toThrow('rate limited');

    expect(providerCallStore.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: '429',
        errorMessage: 'rate limited',
      }),
    }));
  });

  it('aggregates all successful stages and retries for one generation', async () => {
    providerCallStore.findMany.mockResolvedValue([
      {
        id: 'call-1',
        responseId: 'resp-1',
        provider: 'OPENAI',
        modelAlias: 'LUNA',
        actualModelId: 'gpt-5.6-luna',
        stage: 'draft',
        retryIndex: 0,
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 50,
        reasoningTokens: 10,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        costUsd: new Prisma.Decimal('0.10'),
        pricingSnapshot: { id: 'price-1' },
      },
      {
        id: 'call-2',
        responseId: 'resp-2',
        provider: 'OPENAI',
        modelAlias: 'LUNA',
        actualModelId: 'gpt-5.6-luna',
        stage: 'repair',
        retryIndex: 1,
        inputTokens: 80,
        cachedInputTokens: 0,
        outputTokens: 40,
        reasoningTokens: 5,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        costUsd: new Prisma.Decimal('0.08'),
        pricingSnapshot: { id: 'price-1' },
      },
    ]);

    const aggregate = await providerCallAccountingService.aggregateForGeneration('generation-1');

    expect(aggregate?.usage).toMatchObject({
      inputTokens: 180,
      cachedInputTokens: 20,
      outputTokens: 90,
      reasoningTokens: 15,
    });
    expect(aggregate?.actualCostUsd.toString()).toBe('0.18');
    expect(aggregate?.retryCount).toBe(1);
    expect(aggregate?.callsCount).toBe(2);
  });
});
