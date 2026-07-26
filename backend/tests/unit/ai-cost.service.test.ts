import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    aIModelPricing: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { aiCostService, MissingModelPricingError } from '../../src/services/ai-cost.service';

const mockedPrisma = vi.mocked(prisma, true);

describe('aiCostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates model cost from input, cached and output tokens', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue({
      provider: 'OPENAI',
      model: 'gpt-5.4',
      inputPricePer1M: new Prisma.Decimal(2),
      outputPricePer1M: new Prisma.Decimal(10),
      cachedInputPricePer1M: new Prisma.Decimal(0.5),
      currency: 'USD',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    } as never);

    const result = await aiCostService.calculate({
      provider: 'OPENAI',
      model: 'gpt-5.4',
      usage: { inputTokens: 1_000_000, outputTokens: 500_000, cachedInputTokens: 200_000 },
      at: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(result.actualCostUsd.toString()).toBe('6.7');
    expect(result.pricingSnapshot).toMatchObject({ provider: 'OPENAI', model: 'gpt-5.4' });
  });

  it('calculates audio input and output prices independently', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue({
      provider: 'OPENAI',
      model: 'gpt-4o-mini-transcribe',
      inputPricePer1M: new Prisma.Decimal(0),
      outputPricePer1M: new Prisma.Decimal(0),
      cachedInputPricePer1M: null,
      audioInputPricePer1M: new Prisma.Decimal(1.25),
      audioOutputPricePer1M: new Prisma.Decimal(5),
      currency: 'USD',
      validFrom: new Date('2026-07-26T00:00:00.000Z'),
    } as never);

    const result = await aiCostService.calculate({
      provider: 'OPENAI',
      model: 'gpt-4o-mini-transcribe',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        audioInputTokens: 1_000_000,
        audioOutputTokens: 100_000,
      },
    });

    expect(result.actualCostUsd.toString()).toBe('1.75');
  });

  it('throws when pricing is required and missing', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue(null);

    await expect(aiCostService.assertPricingExists({ provider: 'OPENAI', model: 'unknown' }))
      .rejects.toBeInstanceOf(MissingModelPricingError);
  });

  it.each([
    ['gpt-5.6-sol', '5', '0.5', '30', '17.75'],
    ['gpt-5.6-terra', '2.5', '0.25', '15', '8.875'],
    ['gpt-5.6-luna', '1', '0.1', '6', '3.55'],
  ])('calculates deterministic V2 pricing for %s', async (model, input, cached, output, expected) => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue({
      provider: 'OPENAI',
      model,
      inputPricePer1M: new Prisma.Decimal(input),
      outputPricePer1M: new Prisma.Decimal(output),
      cachedInputPricePer1M: new Prisma.Decimal(cached),
      audioInputPricePer1M: null,
      audioOutputPricePer1M: null,
      currency: 'USD',
      validFrom: new Date('2026-07-26T00:00:00.000Z'),
    } as never);

    const result = await aiCostService.calculate({
      provider: 'OPENAI',
      model,
      usage: {
        inputTokens: 1_000_000,
        cachedInputTokens: 500_000,
        outputTokens: 500_000,
        reasoningTokens: 200_000,
      },
    });

    expect(result.actualCostUsd.toString()).toBe(expected);
  });

  it('does not add reasoning tokens to output cost a second time', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue({
      provider: 'OPENAI',
      model: 'gpt-5.6-sol',
      inputPricePer1M: new Prisma.Decimal(0),
      outputPricePer1M: new Prisma.Decimal(10),
      cachedInputPricePer1M: null,
      audioInputPricePer1M: null,
      audioOutputPricePer1M: null,
      currency: 'USD',
      validFrom: new Date('2026-07-26T00:00:00.000Z'),
    } as never);

    const result = await aiCostService.calculate({
      provider: 'OPENAI',
      model: 'gpt-5.6-sol',
      usage: {
        inputTokens: 0,
        outputTokens: 1_000_000,
        reasoningTokens: 600_000,
      },
    });

    expect(result.actualCostUsd.toString()).toBe('10');
  });

  it('applies the provider Batch API discount to actual cost', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue({
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      inputPricePer1M: new Prisma.Decimal(2),
      outputPricePer1M: new Prisma.Decimal(10),
      cachedInputPricePer1M: null,
      audioInputPricePer1M: null,
      audioOutputPricePer1M: null,
      currency: 'USD',
      validFrom: new Date('2026-07-26T00:00:00.000Z'),
    } as never);

    const result = await aiCostService.calculate({
      provider: 'OPENAI',
      model: 'gpt-5.6-luna',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      discountMultiplier: 0.5,
    });

    expect(result.actualCostUsd.toString()).toBe('6');
    expect(result.pricingSnapshot).toMatchObject({ discountMultiplier: 0.5 });
  });
});
