import { GenerationClass, SubscriptionPlan } from '@prisma/client';
import { getPlanBySubscriptionPlan, PricingPlanLimits } from './pricing-plans';

export type FeatureCode =
  | 'ai_chat'
  | 'audio_transcription'
  | 'about_ai_summary'
  | 'positioning'
  | 'audience'
  | 'utp'
  | 'social'
  | 'instagram_profile_generate'
  | 'instagram_profile_improve'
  | 'instagram_highlights_generate'
  | 'instagram_highlight_scenario_generate'
  | 'instagram_highlight_improve'
  | 'instagram_story_improve'
  | 'product_main'
  | 'product_mini'
  | 'lead_magnet'
  | 'post'
  | 'reel'
  | 'video_script'
  | 'article'
  | 'chatbot_chain'
  | 'threads'
  | 'tg_channel_plan'
  | 'tg_channel_post'
  | 'tg_channel_post_edit'
  | 'tg_channel_post_audio_adapt'
  | 'tg_channel_post_video_script'
  | 'castdev_transcription'
  | 'castdev_analysis'
  | 'castdev_synthesis'
  | 'cases_extract_case'
  | 'cases_generate_marketing_insights'
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
  aiCostBudgetRub: number;
  projectLimit: number;
  heavyGenerationLimit: number;
  chatDailyLimit: number;
  dailyGenerationLimit: number;
  monthlyGenerationLimit: number;
  monthlyContentUnits: number;
  teamMembersLimit: number;
  strategyRebuildsLimit: number;
  youtubeScriptsLimit: number;
  longreadsLimit: number;
  hasMarketingSupport: boolean;
  marketingCallsPerMonth: number;
  hasPrioritySupport: boolean;
  hasTeamAccess: boolean;
  hasImplementationSupport: boolean;
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
  audio_transcription: {
    featureCode: 'audio_transcription',
    featureGroup: 'chat',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 0,
    maxContextTokens: 0,
  },
  about_ai_summary: {
    featureCode: 'about_ai_summary',
    featureGroup: 'strategy',
    generationClass: 'LIGHT',
    creditPrice: 2,
    includedTokens: 6000,
    maxContextTokens: 12000,
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
  instagram_profile_generate: {
    featureCode: 'instagram_profile_generate',
    featureGroup: 'strategy',
    generationClass: 'MEDIUM',
    creditPrice: 3,
    includedTokens: 7000,
    maxContextTokens: 14000,
  },
  instagram_profile_improve: {
    featureCode: 'instagram_profile_improve',
    featureGroup: 'strategy',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 4000,
    maxContextTokens: 9000,
  },
  instagram_highlights_generate: {
    featureCode: 'instagram_highlights_generate',
    featureGroup: 'content',
    generationClass: 'HEAVY',
    creditPrice: 4,
    includedTokens: 14000,
    maxContextTokens: 28000,
  },
  instagram_highlight_scenario_generate: {
    featureCode: 'instagram_highlight_scenario_generate',
    featureGroup: 'content',
    generationClass: 'MEDIUM',
    creditPrice: 2,
    includedTokens: 8000,
    maxContextTokens: 18000,
  },
  instagram_highlight_improve: {
    featureCode: 'instagram_highlight_improve',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 6000,
    maxContextTokens: 14000,
  },
  instagram_story_improve: {
    featureCode: 'instagram_story_improve',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 3500,
    maxContextTokens: 9000,
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
  threads: {
    featureCode: 'threads',
    featureGroup: 'content',
    generationClass: 'MEDIUM',
    creditPrice: 3,
    includedTokens: 10000,
    maxContextTokens: 24000,
  },
  tg_channel_plan: {
    featureCode: 'tg_channel_plan',
    featureGroup: 'planning',
    generationClass: 'MEDIUM',
    creditPrice: 4,
    includedTokens: 12000,
    maxContextTokens: 26000,
  },
  tg_channel_post: {
    featureCode: 'tg_channel_post',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 5000,
    maxContextTokens: 12000,
  },
  tg_channel_post_edit: {
    featureCode: 'tg_channel_post_edit',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 3500,
    maxContextTokens: 10000,
  },
  tg_channel_post_audio_adapt: {
    featureCode: 'tg_channel_post_audio_adapt',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 4000,
    maxContextTokens: 10000,
  },
  tg_channel_post_video_script: {
    featureCode: 'tg_channel_post_video_script',
    featureGroup: 'content',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 5000,
    maxContextTokens: 12000,
  },
  castdev_transcription: {
    featureCode: 'castdev_transcription',
    featureGroup: 'strategy',
    generationClass: 'MEDIUM',
    creditPrice: 2,
    includedTokens: 0,
    maxContextTokens: 0,
  },
  castdev_analysis: {
    featureCode: 'castdev_analysis',
    featureGroup: 'strategy',
    generationClass: 'MEDIUM',
    creditPrice: 4,
    includedTokens: 16000,
    maxContextTokens: 36000,
  },
  castdev_synthesis: {
    featureCode: 'castdev_synthesis',
    featureGroup: 'strategy',
    generationClass: 'HEAVY',
    creditPrice: 10,
    includedTokens: 24000,
    maxContextTokens: 80000,
  },
  cases_extract_case: {
    featureCode: 'cases_extract_case',
    featureGroup: 'strategy',
    generationClass: 'MEDIUM',
    creditPrice: 4,
    includedTokens: 12000,
    maxContextTokens: 24000,
  },
  cases_generate_marketing_insights: {
    featureCode: 'cases_generate_marketing_insights',
    featureGroup: 'strategy',
    generationClass: 'LIGHT',
    creditPrice: 1,
    includedTokens: 6000,
    maxContextTokens: 12000,
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

function toPlanLimitConfig(limits: PricingPlanLimits): PlanLimitConfig {
  return {
    monthlyCredits: limits.monthlyCredits,
    aiCostBudgetRub: limits.aiCostBudgetRub,
    projectLimit: limits.projectsLimit,
    heavyGenerationLimit: limits.heavyGenerationsLimit,
    chatDailyLimit: limits.dailyAiMessagesLimit,
    dailyGenerationLimit: limits.monthlyAiGenerationsLimit,
    monthlyGenerationLimit: limits.monthlyAiGenerationsLimit,
    monthlyContentUnits: limits.monthlyContentUnits,
    teamMembersLimit: limits.teamMembersLimit,
    strategyRebuildsLimit: limits.strategyRebuildsLimit,
    youtubeScriptsLimit: limits.youtubeScriptsLimit,
    longreadsLimit: limits.longreadsLimit,
    hasMarketingSupport: limits.hasMarketingSupport,
    marketingCallsPerMonth: limits.marketingCallsPerMonth,
    hasPrioritySupport: limits.hasPrioritySupport,
    hasTeamAccess: limits.hasTeamAccess,
    hasImplementationSupport: limits.hasImplementationSupport,
    features: ALL_FEATURES,
  };
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimitConfig> = {
  FREE: toPlanLimitConfig(getPlanBySubscriptionPlan('FREE').limits),
  START: toPlanLimitConfig(getPlanBySubscriptionPlan('START').limits),
  SYSTEM_FUNNEL: toPlanLimitConfig(getPlanBySubscriptionPlan('SYSTEM_FUNNEL').limits),
  EVERGREEN_FUNNEL: toPlanLimitConfig(getPlanBySubscriptionPlan('EVERGREEN_FUNNEL').limits),
  PRO: toPlanLimitConfig(getPlanBySubscriptionPlan('PRO').limits),
  EXPERT: toPlanLimitConfig(getPlanBySubscriptionPlan('EXPERT').limits),
  SUPPORT: toPlanLimitConfig(getPlanBySubscriptionPlan('SUPPORT').limits),
  MARKETING_PARTNER: toPlanLimitConfig(getPlanBySubscriptionPlan('MARKETING_PARTNER').limits),
  IMPLEMENTATION: toPlanLimitConfig(getPlanBySubscriptionPlan('IMPLEMENTATION').limits),
  ANNUAL: toPlanLimitConfig(getPlanBySubscriptionPlan('ANNUAL').limits),
};
