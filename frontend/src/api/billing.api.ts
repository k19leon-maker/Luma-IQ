import { apiClient } from './client';

export type BillingScenario = 'self' | 'support';

export type BillingPlanLimits = {
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

export type BillingPlan = {
  id: string;
  scenario: BillingScenario;
  name: string;
  priceMonthlyRub: number;
  subscriptionStatus?: string;
  currency: 'RUB';
  billingPeriod: 'month';
  limits?: BillingPlanLimits;
};

export type BillingMe = {
  plan: BillingPlan;
  publicLimits: {
    planName: string;
    planStatus: 'active' | 'inactive' | 'trial' | 'expired' | string;
    aiBalanceTotal: number;
    aiBalanceUsed: number;
    aiBalanceRemaining: number;
    projectsTotal: number;
    projectsUsed: number;
    projectsRemaining: number;
    limitsResetAt: string | null;
  };
  usageHistory: Array<{
    id: string;
    projectId?: string | null;
    actionLabel: string;
    sectionLabel: string;
    aiPointsCharged: number;
    createdAt: string;
  }>;
  limits: BillingPlanLimits;
  usage: {
    creditsUsed: number;
    creditsRemaining: number;
    contentUnitsUsed: number;
    contentUnitsRemaining: number;
    aiMessagesUsedToday: number;
    aiMessagesRemainingToday: number;
    aiGenerationsUsed: number;
    aiGenerationsRemaining: number;
    heavyGenerationsUsed: number;
    heavyGenerationsRemaining: number;
    strategyRebuildsUsed: number;
    strategyRebuildsRemaining: number;
    youtubeScriptsUsed: number;
    youtubeScriptsRemaining: number;
    longreadsUsed: number;
    longreadsRemaining: number;
    projectsUsed: number;
    projectsRemaining: number;
  };
  period: {
    currentPeriodStart: string;
    currentPeriodEnd: string;
  };
};

export const billingApi = {
  listPlans: () =>
    apiClient.get<{ plans: BillingPlan[] }>('/billing/plans').then((response) => response.data.plans),

  getMe: () =>
    apiClient.get<BillingMe>('/billing/me').then((response) => response.data),
};
