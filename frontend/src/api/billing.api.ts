import { apiClient } from './client';

export type BillingScenario = 'free' | 'self' | 'legacy';

export type BillingPlan = {
  id: string;
  scenario: BillingScenario;
  name: string;
  priceMonthlyRub: number;
  aiBalanceTotal?: number;
  projectsTotal?: number;
  subscriptionStatus?: string;
  currency: 'RUB';
  billingPeriod: '30_days';
  periodDays: number;
  shortDescription: string;
  extendedDescription: string;
  badge: string | null;
  includedFeatures: string[];
  exampleUsage: string[];
  usageDisclaimer: string;
  purchasable: boolean;
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
  actionPrices: Array<{
    actionKey: string;
    actionLabel: string;
    sectionLabel: string;
    aiPoints: number;
  }>;
  usageHistory: Array<{
    id: string;
    projectId?: string | null;
    actionLabel: string;
    sectionLabel: string;
    aiPointsCharged: number;
    createdAt: string;
  }>;
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
