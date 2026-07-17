export type PlanCode = 'FREE' | 'START' | 'PRO' | 'EXPERT' | 'SUPPORT' | 'MARKETING_PARTNER' | 'IMPLEMENTATION' | 'ANNUAL';

export interface SubscriptionInfo {
  plan: string;
  status: string;
  expiresAt: string | null;
}

export interface PlanLimits {
  monthlyCredits: number;
  projectLimit: number;
  chatDailyLimit: number;
  dailyGenerationLimit: number;
}

export const FRONTEND_PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  FREE: { monthlyCredits: 1000, projectLimit: 1, chatDailyLimit: 10, dailyGenerationLimit: 100 },
  START: { monthlyCredits: 1000, projectLimit: 1, chatDailyLimit: 10, dailyGenerationLimit: 100 },
  PRO: { monthlyCredits: 10000, projectLimit: 3, chatDailyLimit: 30, dailyGenerationLimit: 300 },
  EXPERT: { monthlyCredits: 10000, projectLimit: 7, chatDailyLimit: 100, dailyGenerationLimit: 700 },
  SUPPORT: { monthlyCredits: 7000, projectLimit: 3, chatDailyLimit: 50, dailyGenerationLimit: 400 },
  MARKETING_PARTNER: { monthlyCredits: 12000, projectLimit: 5, chatDailyLimit: 100, dailyGenerationLimit: 700 },
  IMPLEMENTATION: { monthlyCredits: 20000, projectLimit: 7, chatDailyLimit: 200, dailyGenerationLimit: 1000 },
  ANNUAL: { monthlyCredits: 10000, projectLimit: 3, chatDailyLimit: 30, dailyGenerationLimit: 300 },
};

export const PLAN_LABELS: Record<PlanCode, string> = {
  FREE: 'Start',
  START: 'Start',
  PRO: 'Pro',
  EXPERT: 'Expert',
  SUPPORT: 'Support',
  MARKETING_PARTNER: 'Marketing Partner',
  IMPLEMENTATION: 'Implementation',
  ANNUAL: 'Pro',
};

export function normalizePlan(plan?: string): PlanCode {
  if (
    plan === 'START' ||
    plan === 'PRO' ||
    plan === 'EXPERT' ||
    plan === 'SUPPORT' ||
    plan === 'MARKETING_PARTNER' ||
    plan === 'IMPLEMENTATION' ||
    plan === 'ANNUAL'
  ) {
    return plan;
  }
  return 'START';
}

export function formatLimitNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function formatAccessUntil(value: string | null): string {
  if (!value) return 'без даты окончания';
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}
