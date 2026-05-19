import { FeaturePricingMode, GenerationClass } from '@prisma/client';
import { FEATURE_PRICING, FeatureCode, FeaturePricingConfig } from '../config/ai-economy';
import { prisma } from '../lib/prisma';

export interface ResolvedFeaturePricing extends FeaturePricingConfig {
  pricingMode: FeaturePricingMode;
  minCredits: number;
  maxCredits: number | null;
  source: 'database' | 'config';
}

function isFeatureCode(value: string): value is FeatureCode {
  return Object.prototype.hasOwnProperty.call(FEATURE_PRICING, value);
}

export const featurePricingService = {
  isKnownFeature(featureCode: string): featureCode is FeatureCode {
    return isFeatureCode(featureCode);
  },

  getConfig(featureCode: FeatureCode): FeaturePricingConfig {
    return FEATURE_PRICING[featureCode];
  },

  async resolve(featureCode: FeatureCode, at = new Date()): Promise<ResolvedFeaturePricing> {
    const dbPrice = await prisma.featurePricing.findFirst({
      where: {
        featureCode,
        isActive: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
    });

    const config = FEATURE_PRICING[featureCode];
    if (!dbPrice) {
      return {
        ...config,
        pricingMode: 'FIXED',
        minCredits: config.creditPrice,
        maxCredits: null,
        source: 'config',
      };
    }

    return {
      ...config,
      generationClass: dbPrice.generationClass as GenerationClass,
      creditPrice: dbPrice.creditPrice,
      pricingMode: dbPrice.pricingMode,
      minCredits: dbPrice.minCredits,
      maxCredits: dbPrice.maxCredits,
      source: 'database',
    };
  },

  calculateCredits(pricing: ResolvedFeaturePricing, totalTokens = 0): number {
    if (pricing.pricingMode === 'FIXED') return pricing.creditPrice;

    const extraTokens = Math.max(0, totalTokens - pricing.includedTokens);
    const extraCredits = Math.ceil(extraTokens / 4000);
    const raw = pricing.pricingMode === 'TOKEN_BASED'
      ? Math.max(pricing.minCredits, extraCredits)
      : pricing.creditPrice + extraCredits;

    if (pricing.maxCredits !== null) return Math.min(raw, pricing.maxCredits);
    return raw;
  },
};
