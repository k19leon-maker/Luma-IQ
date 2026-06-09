export type PlanCode = 'FREE' | 'PRO' | 'ANNUAL';

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
  FREE: { monthlyCredits: 25, projectLimit: 1, chatDailyLimit: 5, dailyGenerationLimit: 10 },
  PRO: { monthlyCredits: 2000, projectLimit: 10, chatDailyLimit: 150, dailyGenerationLimit: 250 },
  ANNUAL: { monthlyCredits: 3000, projectLimit: 20, chatDailyLimit: 250, dailyGenerationLimit: 400 },
};

export const PLAN_LABELS: Record<PlanCode, string> = {
  FREE: 'Бесплатный тариф',
  PRO: 'Pro',
  ANNUAL: 'Annual',
};

export function normalizePlan(plan?: string): PlanCode {
  return plan === 'PRO' || plan === 'ANNUAL' ? plan : 'FREE';
}

export function formatLimitNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function formatAccessUntil(value: string | null): string {
  if (!value) return 'без даты окончания';
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}
