import { AIProvider, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
}

export interface AICostResult {
  actualCostUsd: Prisma.Decimal;
  pricingSnapshot: Prisma.InputJsonValue;
}

export class MissingModelPricingError extends Error {
  status = 500;
  code = 'MODEL_PRICING_MISSING';

  constructor(provider: AIProvider, model: string) {
    super(`Нет pricing для модели ${provider}/${model}. Генерация остановлена, чтобы не считать себестоимость неверно.`);
  }
}

export const aiCostService = {
  async assertPricingExists(input: { provider: AIProvider; model: string; at?: Date }): Promise<void> {
    const at = input.at ?? new Date();
    const pricing = await prisma.aIModelPricing.findFirst({
      where: {
        provider: input.provider,
        model: input.model,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      select: { id: true },
    });
    if (!pricing) throw new MissingModelPricingError(input.provider, input.model);
  },

  async calculate(input: {
    provider: AIProvider;
    model: string;
    usage: TokenUsage;
    at?: Date;
    discountMultiplier?: number;
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

    const cachedInputTokens = Math.min(input.usage.inputTokens, input.usage.cachedInputTokens ?? 0);
    const uncachedInputTokens = Math.max(0, input.usage.inputTokens - cachedInputTokens);
    const inputCost = new Prisma.Decimal(uncachedInputTokens)
      .div(1_000_000)
      .mul(pricing.inputPricePer1M);
    const outputCost = new Prisma.Decimal(input.usage.outputTokens)
      .div(1_000_000)
      .mul(pricing.outputPricePer1M);
    const cachedCost = new Prisma.Decimal(cachedInputTokens)
      .div(1_000_000)
      .mul(pricing.cachedInputPricePer1M ?? 0);
    const audioInputCost = new Prisma.Decimal(input.usage.audioInputTokens ?? 0)
      .div(1_000_000)
      .mul(pricing.audioInputPricePer1M ?? 0);
    const audioOutputCost = new Prisma.Decimal(input.usage.audioOutputTokens ?? 0)
      .div(1_000_000)
      .mul(pricing.audioOutputPricePer1M ?? 0);
    const discountMultiplier = input.discountMultiplier ?? 1;
    const actualCostUsd = inputCost
      .add(outputCost)
      .add(cachedCost)
      .add(audioInputCost)
      .add(audioOutputCost)
      .mul(discountMultiplier);

    return {
      actualCostUsd,
      pricingSnapshot: {
        provider: pricing.provider,
        model: pricing.model,
        inputPricePer1M: pricing.inputPricePer1M.toString(),
        outputPricePer1M: pricing.outputPricePer1M.toString(),
        cachedInputPricePer1M: pricing.cachedInputPricePer1M?.toString() ?? null,
        audioInputPricePer1M: pricing.audioInputPricePer1M?.toString() ?? null,
        audioOutputPricePer1M: pricing.audioOutputPricePer1M?.toString() ?? null,
        currency: pricing.currency,
        discountMultiplier,
        validFrom: pricing.validFrom.toISOString(),
      },
    };
  },
};
