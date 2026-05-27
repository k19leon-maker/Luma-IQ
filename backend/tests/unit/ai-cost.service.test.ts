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

    expect(result.actualCostUsd.toString()).toBe('7.1');
    expect(result.pricingSnapshot).toMatchObject({ provider: 'OPENAI', model: 'gpt-5.4' });
  });

  it('throws when pricing is required and missing', async () => {
    mockedPrisma.aIModelPricing.findFirst.mockResolvedValue(null);

    await expect(aiCostService.assertPricingExists({ provider: 'OPENAI', model: 'unknown' }))
      .rejects.toBeInstanceOf(MissingModelPricingError);
  });
});
