import { GenerationClass, SubscriptionPlan } from '@prisma/client';

export type FeatureCode =
  | 'ai_chat'
  | 'positioning'
  | 'audience'
  | 'utp'
  | 'social'
  | 'product_main'
  | 'product_mini'
  | 'lead_magnet'
  | 'post'
  | 'reel'
  | 'video_script'
  | 'article'
  | 'chatbot_chain'
  | 'content_plan'
  | 'jtbd';

export interface FeaturePricingConfig {
  featureCode: FeatureCode;
  featureGroup: 'chat' | 'strategy' | 'product' | 'content' | 'planning';
  generationClass: GenerationClass;
  creditPrice: number;
  includedTokens: number;
  maxContextTokens: number;
}

export interface PlanLimitConfig {
  monthlyCredits: number;
  projectLimit: number;
  heavyGenerationLimit: number;
  chatDailyLimit: number;
  features: Record<string, boolean>;
}

export const FEATURE_PRICING: Record<FeatureCode, FeaturePricingConfig> = {
  ai_chat: {
    featureCode: 'ai_chat',
    featureGroup: 'chat',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 4000,
    maxContextTokens: 8000,
  },
  positioning: {
    featureCode: 'positioning',
    featureGroup: 'strategy',
    generationClass: 'HEAVY',
    creditPrice: 5,
    includedTokens: 12000,
    maxContextTokens: 24000,
  },
  audience: {
    featureCode: 'audience',
    featureGroup: 'strategy',
    generationClass: 'HEAVY',
    creditPrice: 5,
    includedTokens: 14000,
    maxContextTokens: 28000,
  },
  utp: {
    featureCode: 'utp',
    featureGroup: 'strategy',
    generationClass: 'HEAVY',
    creditPrice: 4,
    includedTokens: 12000,
    maxContextTokens: 24000,
  },
  social: {
    featureCode: 'social',
    featureGroup: 'strategy',
    generationClass: 'MEDIUM',
    creditPrice: 3,
    includedTokens: 10000,
    maxContextTokens: 18000,
  },
  product_main: {
    featureCode: 'product_main',
    featureGroup: 'product',
    generationClass: 'HEAVY',
    creditPrice: 6,
    includedTokens: 16000,
    maxContextTokens: 32000,
  },
  product_mini: {
    featureCode: 'product_mini',
    featureGroup: 'product',
    generationClass: 'HEAVY',
    creditPrice: 5,
    includedTokens: 14000,
    maxContextTokens: 28000,
  },
  lead_magnet: {
    featureCode: 'lead_magnet',
    featureGroup: 'product',
    generationClass: 'HEAVY',
    creditPrice: 5,
    includedTokens: 14000,
    maxContextTokens: 28000,
  },
  post: {
    featureCode: 'post',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 5000,
    maxContextTokens: 10000,
  },
  reel: {
    featureCode: 'reel',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 5000,
    maxContextTokens: 10000,
  },
  video_script: {
    featureCode: 'video_script',
    featureGroup: 'content',
    generationClass: 'MEDIUM',
    creditPrice: 4,
    includedTokens: 12000,
    maxContextTokens: 24000,
  },
  article: {
    featureCode: 'article',
    featureGroup: 'content',
    generationClass: 'MEDIUM',
    creditPrice: 3,
    includedTokens: 10000,
    maxContextTokens: 20000,
  },
  chatbot_chain: {
    featureCode: 'chatbot_chain',
    featureGroup: 'content',
    generationClass: 'MEDIUM',
    creditPrice: 2,
    includedTokens: 8000,
    maxContextTokens: 16000,
  },
  content_plan: {
    featureCode: 'content_plan',
    featureGroup: 'planning',
    generationClass: 'EXTREME',
    creditPrice: 10,
    includedTokens: 24000,
    maxContextTokens: 48000,
  },
  jtbd: {
    featureCode: 'jtbd',
    featureGroup: 'strategy',
    generationClass: 'HEAVY',
    creditPrice: 5,
    includedTokens: 14000,
    maxContextTokens: 28000,
  },
};

const ALL_FEATURES = Object.keys(FEATURE_PRICING).reduce<Record<string, boolean>>((acc, key) => {
  acc[key] = true;
  return acc;
}, {});

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimitConfig> = {
  FREE: {
    monthlyCredits: 25,
    projectLimit: 1,
    heavyGenerationLimit: 2,
    chatDailyLimit: 5,
    features: {
      ai_chat: true,
      positioning: true,
      audience: false,
      utp: false,
      social: false,
      product_main: false,
      product_mini: false,
      lead_magnet: false,
      post: false,
      reel: false,
      video_script: false,
      article: false,
      chatbot_chain: false,
      content_plan: false,
      jtbd: true,
    },
  },
  PRO: {
    monthlyCredits: 2000,
    projectLimit: 10,
    heavyGenerationLimit: 80,
    chatDailyLimit: 150,
    features: ALL_FEATURES,
  },
  ANNUAL: {
    monthlyCredits: 3000,
    projectLimit: 20,
    heavyGenerationLimit: 120,
    chatDailyLimit: 250,
    features: ALL_FEATURES,
  },
};
