import { AIProvider, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface AICostResult {
  actualCostUsd: Prisma.Decimal;
  pricingSnapshot: Prisma.InputJsonValue;
}

export const aiCostService = {
  async calculate(input: {
    provider: AIProvider;
    model: string;
    usage: TokenUsage;
    at?: Date;
  }): Promise<AICostResult> {
    const at = input.at ?? new Date();
    const pricing = await prisma.aIModelPricing.findFirst({
      where: {
        provider: input.provider,
        model: input.model,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!pricing) {
      return {
        actualCostUsd: new Prisma.Decimal(0),
        pricingSnapshot: {
          provider: input.provider,
          model: input.model,
          missingPricing: true,
        },
      };
    }

    const inputCost = new Prisma.Decimal(input.usage.inputTokens)
      .div(1_000_000)
      .mul(pricing.inputPricePer1M);
    const outputCost = new Prisma.Decimal(input.usage.outputTokens)
      .div(1_000_000)
      .mul(pricing.outputPricePer1M);
    const cachedCost = new Prisma.Decimal(input.usage.cachedInputTokens ?? 0)
      .div(1_000_000)
      .mul(pricing.cachedInputPricePer1M ?? 0);
    const actualCostUsd = inputCost.add(outputCost).add(cachedCost);

    return {
      actualCostUsd,
      pricingSnapshot: {
        provider: pricing.provider,
        model: pricing.model,
        inputPricePer1M: pricing.inputPricePer1M.toString(),
        outputPricePer1M: pricing.outputPricePer1M.toString(),
        cachedInputPricePer1M: pricing.cachedInputPricePer1M?.toString() ?? null,
        currency: pricing.currency,
        validFrom: pricing.validFrom.toISOString(),
      },
    };
  },
};
