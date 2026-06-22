import type { SubscriptionPlan } from '@prisma/client';

export type BillingScenario = 'self' | 'support';

export type PlanId =
  | 'start'
  | 'pro'
  | 'expert'
  | 'support'
  | 'marketing_partner'
  | 'implementation';

export type UsageAction =
  | 'ai_chat_message'
  | 'content_post'
  | 'reels_script'
  | 'threads_post'
  | 'youtube_script'
  | 'longread'
  | 'content_plan_7_days'
  | 'content_plan_30_days'
  | 'strategy_rebuild'
  | 'product_packaging'
  | 'landing_structure'
  | 'funnel_strategy'
  | 'heavy_generation';

export type PricingPlanLimits = {
  projectsLimit: number;
  monthlyCredits: number;
  monthlyContentUnits: number;
  dailyAiMessagesLimit: number;
  monthlyAiGenerationsLimit: number;
  heavyGenerationsLimit: number;
  teamMembersLimit: number;
  strategyRebuildsLimit: number;
  youtubeScriptsLimit: number;
  longreadsLimit: number;
  hasMarketingSupport: boolean;
  marketingCallsPerMonth: number;
  hasPrioritySupport: boolean;
  hasTeamAccess: boolean;
  hasImplementationSupport: boolean;
};

export type PricingPlan = {
  id: PlanId;
  scenario: BillingScenario;
  name: string;
  priceMonthlyRub: number;
  currency: 'RUB';
  billingPeriod: 'month';
  limits: PricingPlanLimits;
};

export const PRICING_PLANS: Record<PlanId, PricingPlan> = {
  start: {
    id: 'start',
    scenario: 'self',
    name: 'Start',
    priceMonthlyRub: 12000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 1,
      monthlyCredits: 1000,
      monthlyContentUnits: 50,
      dailyAiMessagesLimit: 10,
      monthlyAiGenerationsLimit: 100,
      heavyGenerationsLimit: 10,
      teamMembersLimit: 1,
      strategyRebuildsLimit: 3,
      youtubeScriptsLimit: 2,
      longreadsLimit: 2,
      hasMarketingSupport: false,
      marketingCallsPerMonth: 0,
      hasPrioritySupport: false,
      hasTeamAccess: false,
      hasImplementationSupport: false,
    },
  },
  pro: {
    id: 'pro',
    scenario: 'self',
    name: 'Pro',
    priceMonthlyRub: 24000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 3,
      monthlyCredits: 3000,
      monthlyContentUnits: 150,
      dailyAiMessagesLimit: 30,
      monthlyAiGenerationsLimit: 300,
      heavyGenerationsLimit: 30,
      teamMembersLimit: 1,
      strategyRebuildsLimit: 10,
      youtubeScriptsLimit: 8,
      longreadsLimit: 8,
      hasMarketingSupport: false,
      marketingCallsPerMonth: 0,
      hasPrioritySupport: false,
      hasTeamAccess: false,
      hasImplementationSupport: false,
    },
  },
  expert: {
    id: 'expert',
    scenario: 'self',
    name: 'Expert',
    priceMonthlyRub: 39000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 7,
      monthlyCredits: 7000,
      monthlyContentUnits: 350,
      dailyAiMessagesLimit: 100,
      monthlyAiGenerationsLimit: 700,
      heavyGenerationsLimit: 70,
      teamMembersLimit: 3,
      strategyRebuildsLimit: 30,
      youtubeScriptsLimit: 20,
      longreadsLimit: 20,
      hasMarketingSupport: false,
      marketingCallsPerMonth: 0,
      hasPrioritySupport: false,
      hasTeamAccess: true,
      hasImplementationSupport: false,
    },
  },
  support: {
    id: 'support',
    scenario: 'support',
    name: 'Support',
    priceMonthlyRub: 39000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 3,
      monthlyCredits: 4000,
      monthlyContentUnits: 150,
      dailyAiMessagesLimit: 50,
      monthlyAiGenerationsLimit: 400,
      heavyGenerationsLimit: 40,
      teamMembersLimit: 1,
      strategyRebuildsLimit: 15,
      youtubeScriptsLimit: 10,
      longreadsLimit: 10,
      hasMarketingSupport: true,
      marketingCallsPerMonth: 1,
      hasPrioritySupport: false,
      hasTeamAccess: false,
      hasImplementationSupport: false,
    },
  },
  marketing_partner: {
    id: 'marketing_partner',
    scenario: 'support',
    name: 'Marketing Partner',
    priceMonthlyRub: 59000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 5,
      monthlyCredits: 7000,
      monthlyContentUnits: 250,
      dailyAiMessagesLimit: 100,
      monthlyAiGenerationsLimit: 700,
      heavyGenerationsLimit: 70,
      teamMembersLimit: 3,
      strategyRebuildsLimit: 30,
      youtubeScriptsLimit: 20,
      longreadsLimit: 20,
      hasMarketingSupport: true,
      marketingCallsPerMonth: 4,
      hasPrioritySupport: true,
      hasTeamAccess: true,
      hasImplementationSupport: false,
    },
  },
  implementation: {
    id: 'implementation',
    scenario: 'support',
    name: 'Implementation',
    priceMonthlyRub: 89000,
    currency: 'RUB',
    billingPeriod: 'month',
    limits: {
      projectsLimit: 7,
      monthlyCredits: 10000,
      monthlyContentUnits: 400,
      dailyAiMessagesLimit: 200,
      monthlyAiGenerationsLimit: 1000,
      heavyGenerationsLimit: 100,
      teamMembersLimit: 5,
      strategyRebuildsLimit: 50,
      youtubeScriptsLimit: 40,
      longreadsLimit: 40,
      hasMarketingSupport: true,
      marketingCallsPerMonth: 4,
      hasPrioritySupport: true,
      hasTeamAccess: true,
      hasImplementationSupport: true,
    },
  },
};

export const CREDIT_COSTS: Record<UsageAction, number> = {
  ai_chat_message: 5,
  content_post: 20,
  reels_script: 20,
  threads_post: 20,
  youtube_script: 100,
  longread: 120,
  content_plan_7_days: 150,
  content_plan_30_days: 500,
  strategy_rebuild: 300,
  product_packaging: 300,
  landing_structure: 300,
  funnel_strategy: 500,
  heavy_generation: 150,
};

export const CONTENT_UNIT_COSTS: Partial<Record<UsageAction, number>> = {
  content_post: 1,
  reels_script: 1,
  threads_post: 1,
  youtube_script: 5,
  longread: 5,
  content_plan_7_days: 7,
  content_plan_30_days: 30,
  landing_structure: 10,
  funnel_strategy: 15,
  product_packaging: 15,
};

const DB_PLAN_TO_PLAN_ID: Record<string, PlanId> = {
  FREE: 'start',
  START: 'start',
  PRO: 'pro',
  EXPERT: 'expert',
  SUPPORT: 'support',
  MARKETING_PARTNER: 'marketing_partner',
  IMPLEMENTATION: 'implementation',
  ANNUAL: 'pro',
};

const PLAN_ID_TO_DB_PLAN: Record<PlanId, SubscriptionPlan> = {
  start: 'START',
  pro: 'PRO',
  expert: 'EXPERT',
  support: 'SUPPORT',
  marketing_partner: 'MARKETING_PARTNER',
  implementation: 'IMPLEMENTATION',
};

export function getPlanById(planId: PlanId): PricingPlan {
  return PRICING_PLANS[planId];
}

export function getPlanLimits(planId: PlanId): PricingPlanLimits {
  return PRICING_PLANS[planId].limits;
}

export function isValidPlanId(planId: string): planId is PlanId {
  return Object.prototype.hasOwnProperty.call(PRICING_PLANS, planId);
}

export function normalizePlanId(plan?: string | null): PlanId {
  if (!plan) return 'start';
  const normalized = plan.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return DB_PLAN_TO_PLAN_ID[normalized] ?? (isValidPlanId(plan) ? plan : 'start');
}

export function toSubscriptionPlan(planId: PlanId): SubscriptionPlan {
  return PLAN_ID_TO_DB_PLAN[planId];
}

export function getPlanBySubscriptionPlan(plan?: SubscriptionPlan | string | null): PricingPlan {
  return getPlanById(normalizePlanId(plan));
}
