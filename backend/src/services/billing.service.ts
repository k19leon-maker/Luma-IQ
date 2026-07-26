import { getPlanBySubscriptionPlan, PRICING_PLANS } from '../config/pricing-plans';
import { AI_ACTION_LABELS, AI_ACTION_SECTIONS, type AiActionType } from '../config/ai-actions';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiBalanceService } from './ai-balance.service';

export const billingService = {
  listPlans() {
    return Object.values(PRICING_PLANS)
      .filter((plan) => plan.scenario === 'self')
      .map((plan) => ({
      id: plan.id,
      scenario: plan.scenario,
      name: plan.name,
      priceMonthlyRub: plan.priceMonthlyRub,
      aiBalanceTotal: plan.limits.monthlyCredits,
      projectsTotal: plan.limits.projectsLimit,
      currency: plan.currency,
      billingPeriod: plan.billingPeriod,
      }));
  },

  async getMyBilling(userId: string) {
    const access = await accessPolicyService.getUserAccess(userId);
    const plan = getPlanBySubscriptionPlan(access.plan);
    const limits = plan.limits;
    const [projectsUsed, aiBalanceUsed, usageHistory, actionPrices] = await Promise.all([
      prisma.project.count({ where: { userId } }),
      aiBalanceService.getUsedInPeriod({ userId, billingPeriodId: access.billingPeriod.id }),
      aiBalanceService.getHistory({ userId, billingPeriodId: access.billingPeriod.id, limit: 30 }),
      aiActionRegistryService.listPrices().then((prices) => prices.map(({ actionKey, aiPoints }) => {
        return {
          actionKey,
          actionLabel: AI_ACTION_LABELS[actionKey as AiActionType] ?? 'AI-действие',
          sectionLabel: AI_ACTION_SECTIONS[actionKey as AiActionType] ?? 'Luma IQ',
          aiPoints,
        };
      })),
    ]);

    const planStatus = access.subscription?.status?.toLowerCase() ?? 'active';
    const publicLimits = aiBalanceService.buildPlanLimits({
      planName: plan.name,
      planStatus,
      aiBalanceTotal: limits.monthlyCredits,
      aiBalanceUsed,
      projectsTotal: limits.projectsLimit,
      projectsUsed,
      limitsResetAt: access.billingPeriod.periodEnd,
    });

    return {
      plan: {
        id: plan.id,
        scenario: plan.scenario,
        name: plan.name,
        priceMonthlyRub: plan.priceMonthlyRub,
        subscriptionStatus: planStatus,
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
      },
      publicLimits,
      actionPrices,
      usageHistory,
      period: {
        currentPeriodStart: access.billingPeriod.periodStart,
        currentPeriodEnd: access.billingPeriod.periodEnd,
      },
    };
  },
};
