import type { SubscriptionPlan } from '@prisma/client';

export type BillingScenario = 'free' | 'self' | 'legacy';

export type PlanId =
  | 'FREE'
  | 'START'
  | 'SYSTEM_FUNNEL'
  | 'EVERGREEN_FUNNEL'
  | 'PRO'
  | 'EXPERT'
  | 'SUPPORT'
  | 'MARKETING_PARTNER'
  | 'IMPLEMENTATION'
  | 'ANNUAL';

export type PublicPaidPlanId = 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL';

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
  aiCostBudgetRub: number;
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
  billingPeriod: '30_days';
  periodDays: 30;
  limits: PricingPlanLimits;
  public: boolean;
  purchasable: boolean;
  legacy: boolean;
  displayOrder: number;
  shortDescription: string;
  extendedDescription: string;
  badge?: string;
  includedFeatures: string[];
  exampleUsage: string[];
  usageDisclaimer: string;
};

const ALL_TOOLS = [
  'Полный доступ к инструментам Luma IQ',
  'Стратегия, продукты, воронки и контент',
  'AI-диалог с контекстом проекта',
  'Персональный план маркетинговых задач',
  'Сохранение результатов внутри проекта',
];

const USAGE_DISCLAIMER =
  'Это пример возможного использования баланса. Распределяйте AI-баллы между инструментами Luma IQ самостоятельно.';

function limits(
  projectsLimit: number,
  monthlyCredits: number,
  aiCostBudgetRub: number,
  legacy: Partial<PricingPlanLimits> = {},
): PricingPlanLimits {
  return {
    projectsLimit,
    monthlyCredits,
    aiCostBudgetRub,
    // Legacy technical counters remain available for admin analytics only.
    // Runtime AI access is governed by the unified AI balance.
    monthlyContentUnits: legacy.monthlyContentUnits ?? 0,
    dailyAiMessagesLimit: legacy.dailyAiMessagesLimit ?? 0,
    monthlyAiGenerationsLimit: legacy.monthlyAiGenerationsLimit ?? 0,
    heavyGenerationsLimit: legacy.heavyGenerationsLimit ?? 0,
    teamMembersLimit: legacy.teamMembersLimit ?? 1,
    strategyRebuildsLimit: legacy.strategyRebuildsLimit ?? 0,
    youtubeScriptsLimit: legacy.youtubeScriptsLimit ?? 0,
    longreadsLimit: legacy.longreadsLimit ?? 0,
    hasMarketingSupport: legacy.hasMarketingSupport ?? false,
    marketingCallsPerMonth: legacy.marketingCallsPerMonth ?? 0,
    hasPrioritySupport: legacy.hasPrioritySupport ?? false,
    hasTeamAccess: legacy.hasTeamAccess ?? false,
    hasImplementationSupport: legacy.hasImplementationSupport ?? false,
  };
}

function legacyPlan(
  id: Exclude<PlanId, 'FREE' | PublicPaidPlanId>,
  name: string,
  priceMonthlyRub: number,
  planLimits: PricingPlanLimits,
): PricingPlan {
  return {
    id,
    scenario: 'legacy',
    name,
    priceMonthlyRub,
    currency: 'RUB',
    billingPeriod: '30_days',
    periodDays: 30,
    limits: planLimits,
    public: false,
    purchasable: false,
    legacy: true,
    displayOrder: 100,
    shortDescription: 'Архивный тариф. Недоступен для новых покупок.',
    extendedDescription: 'Сохранён для действующих подписок, платежей и административной истории.',
    includedFeatures: [],
    exampleUsage: [],
    usageDisclaimer: USAGE_DISCLAIMER,
  };
}

export const PRICING_PLANS: Record<PlanId, PricingPlan> = {
  FREE: {
    id: 'FREE',
    scenario: 'free',
    name: 'Бесплатный',
    priceMonthlyRub: 0,
    currency: 'RUB',
    billingPeriod: '30_days',
    periodDays: 30,
    limits: limits(1, 2000, 0),
    public: false,
    purchasable: false,
    legacy: false,
    displayOrder: 0,
    shortDescription: 'Бесплатный доступ Luma IQ.',
    extendedDescription: 'Параметры бесплатного тарифа сохранены без изменений.',
    includedFeatures: ALL_TOOLS,
    exampleUsage: [],
    usageDisclaimer: USAGE_DISCLAIMER,
  },
  START: {
    id: 'START',
    scenario: 'self',
    name: 'Старт',
    priceMonthlyRub: 7900,
    currency: 'RUB',
    billingPeriod: '30_days',
    periodDays: 30,
    limits: limits(1, 5000, 790),
    public: true,
    purchasable: true,
    legacy: false,
    displayOrder: 1,
    shortDescription: 'Соберите маркетинговую систему для одного направления.',
    extendedDescription:
      'Подходит, чтобы проработать один сегмент целевой аудитории, собрать продукты и воронку, подготовить основные маркетинговые материалы и начать регулярно создавать контент.',
    includedFeatures: ALL_TOOLS,
    exampleUsage: [
      '1 проработку целевой аудитории',
      '5 транскрибаций и анализов CustDev',
      '2 лид-магнита',
      '3 сценария для чат-бота',
      '25 постов',
      '25 сценариев для Reels',
      '5 статей',
      '5 сценариев для видео',
    ],
    usageDisclaimer: USAGE_DISCLAIMER,
  },
  SYSTEM_FUNNEL: {
    id: 'SYSTEM_FUNNEL',
    scenario: 'self',
    name: 'Системная воронка',
    priceMonthlyRub: 12000,
    currency: 'RUB',
    billingPeriod: '30_days',
    periodDays: 30,
    limits: limits(3, 10000, 1200),
    public: true,
    purchasable: true,
    legacy: false,
    displayOrder: 2,
    badge: 'Оптимальный',
    shortDescription: 'Развивайте несколько сегментов, продуктов и контентных направлений в единой системе.',
    extendedDescription:
      'Подходит, чтобы системно работать с несколькими направлениями, собирать отдельные воронки под разные сегменты аудитории и выпускать контент на регулярной основе.',
    includedFeatures: ALL_TOOLS,
    exampleUsage: [
      '3 проработки целевой аудитории',
      '10 транскрибаций и анализов CustDev',
      '3 лид-магнита',
      '5 сценариев для чат-бота',
      '50 постов',
      '50 сценариев для Reels',
      '10 статей',
      '10 сценариев для видео',
    ],
    usageDisclaimer: USAGE_DISCLAIMER,
  },
  EVERGREEN_FUNNEL: {
    id: 'EVERGREEN_FUNNEL',
    scenario: 'self',
    name: 'Вечная автоворонка',
    priceMonthlyRub: 19700,
    currency: 'RUB',
    billingPeriod: '30_days',
    periodDays: 30,
    limits: limits(5, 20000, 1970),
    public: true,
    purchasable: true,
    legacy: false,
    displayOrder: 3,
    shortDescription: 'Постройте полноценную маркетинговую систему для нескольких сегментов, продуктов и воронок.',
    extendedDescription:
      'Подходит для построения полноценной маркетинговой системы из нескольких направлений: от исследований аудитории и разработки продуктов до автоворонок, контента и регулярного масштабирования.',
    includedFeatures: ALL_TOOLS,
    exampleUsage: [
      '5 проработок целевой аудитории',
      '20 транскрибаций и анализов CustDev',
      '5 лид-магнитов',
      '10 сценариев для чат-бота',
      '100 постов',
      '100 сценариев для Reels',
      '20 статей',
      '20 сценариев для видео',
    ],
    usageDisclaimer: USAGE_DISCLAIMER,
  },
  PRO: legacyPlan('PRO', 'Pro', 12000, limits(3, 10000, 1200)),
  EXPERT: legacyPlan('EXPERT', 'Expert', 39000, limits(7, 10000, 3900, { hasTeamAccess: true, teamMembersLimit: 3 })),
  SUPPORT: legacyPlan('SUPPORT', 'Support', 39000, limits(3, 7000, 3900, { hasMarketingSupport: true, marketingCallsPerMonth: 1 })),
  MARKETING_PARTNER: legacyPlan('MARKETING_PARTNER', 'Marketing Partner', 59000, limits(5, 12000, 5900, {
    hasMarketingSupport: true,
    marketingCallsPerMonth: 4,
    hasPrioritySupport: true,
    hasTeamAccess: true,
    teamMembersLimit: 3,
  })),
  IMPLEMENTATION: legacyPlan('IMPLEMENTATION', 'Implementation', 89000, limits(7, 20000, 8900, {
    hasMarketingSupport: true,
    marketingCallsPerMonth: 4,
    hasPrioritySupport: true,
    hasTeamAccess: true,
    hasImplementationSupport: true,
    teamMembersLimit: 5,
  })),
  ANNUAL: legacyPlan('ANNUAL', 'Annual', 0, limits(3, 10000, 0)),
};

export const PUBLIC_PAID_PLAN_IDS: PublicPaidPlanId[] = ['START', 'SYSTEM_FUNNEL', 'EVERGREEN_FUNNEL'];
export const LEGACY_PLAN_IDS: PlanId[] = ['PRO', 'EXPERT', 'SUPPORT', 'MARKETING_PARTNER', 'IMPLEMENTATION', 'ANNUAL'];

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

const PLAN_ALIASES: Record<string, PlanId> = {
  FREE: 'FREE',
  START: 'START',
  SYSTEM_FUNNEL: 'SYSTEM_FUNNEL',
  EVERGREEN_FUNNEL: 'EVERGREEN_FUNNEL',
  PRO: 'PRO',
  EXPERT: 'EXPERT',
  SUPPORT: 'SUPPORT',
  MARKETING_PARTNER: 'MARKETING_PARTNER',
  MARKETING_PARTNER_MONTHLY: 'MARKETING_PARTNER',
  IMPLEMENTATION: 'IMPLEMENTATION',
  ANNUAL: 'ANNUAL',
};

export function resolvePlanId(value?: string | null): PlanId | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return PLAN_ALIASES[normalized] ?? null;
}

export function getPlanById(planId: PlanId): PricingPlan {
  return PRICING_PLANS[planId];
}

export function getPlanLimits(planId: PlanId): PricingPlanLimits {
  return PRICING_PLANS[planId].limits;
}

export function isValidPlanId(value: string): value is PlanId {
  return resolvePlanId(value) !== null;
}

export function isPurchasablePlanId(value: string): value is PublicPaidPlanId {
  const id = resolvePlanId(value);
  return id !== null && PRICING_PLANS[id].purchasable;
}

export function normalizePlanId(plan?: string | null): PlanId {
  return resolvePlanId(plan) ?? 'FREE';
}

export function toSubscriptionPlan(planId: PlanId): SubscriptionPlan {
  return planId as SubscriptionPlan;
}

export function getPlanBySubscriptionPlan(plan?: SubscriptionPlan | string | null): PricingPlan {
  return getPlanById(normalizePlanId(plan));
}
