import { getPlanBySubscriptionPlan, PRICING_PLANS, PUBLIC_PAID_PLAN_IDS } from '../config/pricing-plans';
import { AI_ACTION_LABELS, AI_ACTION_SECTIONS, type AiActionType } from '../config/ai-actions';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiBalanceService } from './ai-balance.service';
import { planCatalogService, type RuntimePricingPlan } from './plan-catalog.service';

function publicPlanResponse(plan: RuntimePricingPlan | typeof PRICING_PLANS.START) {
  return {
    id: plan.id,
    scenario: plan.scenario,
    name: plan.name,
    priceMonthlyRub: plan.priceMonthlyRub,
    aiBalanceTotal: plan.limits.monthlyCredits,
    projectsTotal: plan.limits.projectsLimit,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    periodDays: plan.periodDays,
    shortDescription: plan.shortDescription,
    extendedDescription: plan.extendedDescription,
    badge: plan.badge ?? null,
    includedFeatures: plan.includedFeatures,
    exampleUsage: plan.exampleUsage,
    usageDisclaimer: plan.usageDisclaimer,
    purchasable: plan.purchasable,
  };
}

export const billingService = {
  listPlans() {
    return PUBLIC_PAID_PLAN_IDS
      .map((id) => PRICING_PLANS[id])
      .filter((plan) => plan.public && plan.purchasable)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(publicPlanResponse);
  },

  async listRuntimePlans() {
    return (await planCatalogService.listPublic()).map(publicPlanResponse);
  },

  async getMyBilling(userId: string) {
    const access = await accessPolicyService.getUserAccess(userId);
    const plan = getPlanBySubscriptionPlan(access.plan);
    const limits = plan.limits;
    const [projectsUsed, aiBalanceUsed, usageHistory, actionPrices] = await Promise.all([
      prisma.project.count({ where: { userId, status: { not: 'ARCHIVED' } } }),
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
    const periodAiBalanceTotal = access.billingPeriod.creditsGranted > 0
      ? access.billingPeriod.creditsGranted
      : limits.monthlyCredits;
    const publicLimits = aiBalanceService.buildPlanLimits({
      planName: plan.name,
      planStatus,
      aiBalanceTotal: periodAiBalanceTotal,
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
