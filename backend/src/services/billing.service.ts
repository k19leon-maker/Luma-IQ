import { getPlanBySubscriptionPlan, PRICING_PLANS } from '../config/pricing-plans';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiBalanceService } from './ai-balance.service';

export const billingService = {
  listPlans() {
    return Object.values(PRICING_PLANS).map((plan) => ({
      id: plan.id,
      scenario: plan.scenario,
      name: plan.name,
      priceMonthlyRub: plan.priceMonthlyRub,
      aiCostBudgetRub: plan.limits.aiCostBudgetRub,
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
    const [projectsUsed, aiBalanceUsed, usageHistory] = await Promise.all([
      prisma.project.count({ where: { userId } }),
      aiBalanceService.getUsedInPeriod({ userId, billingPeriodId: access.billingPeriod.id }),
      aiBalanceService.getHistory({ userId, billingPeriodId: access.billingPeriod.id, limit: 30 }),
    ]);

    const planStatus = access.subscription?.status?.toLowerCase() ?? 'active';
    const publicLimits = aiBalanceService.buildPlanLimits({
      planName: plan.name,
      planStatus,
      aiBalanceTotal: limits.monthlyCredits,
      aiBalanceUsed,
      aiCostBudgetRub: limits.aiCostBudgetRub,
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
        aiCostBudgetRub: limits.aiCostBudgetRub,
        subscriptionStatus: planStatus,
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
      },
      publicLimits,
      usageHistory,
      period: {
        currentPeriodStart: access.billingPeriod.periodStart,
        currentPeriodEnd: access.billingPeriod.periodEnd,
      },
    };
  },
};
