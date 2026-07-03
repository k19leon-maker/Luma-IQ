import { FeatureCode } from '../config/ai-economy';
import { CONTENT_UNIT_COSTS, getPlanBySubscriptionPlan, PRICING_PLANS, UsageAction } from '../config/pricing-plans';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';

function featureToUsageAction(featureCode: string): UsageAction | null {
  switch (featureCode as FeatureCode) {
    case 'ai_chat': return 'ai_chat_message';
    case 'post': return 'content_post';
    case 'reel': return 'reels_script';
    case 'threads': return 'threads_post';
    case 'video_script': return 'youtube_script';
    case 'article': return 'longread';
    case 'lead_magnet': return 'longread';
    case 'content_plan': return 'content_plan_30_days';
    case 'product_main':
    case 'product_mini': return 'product_packaging';
    case 'positioning':
    case 'audience':
    case 'utp':
    case 'social':
    case 'jtbd':
    case 'chatbot_chain':
      return 'heavy_generation';
    default:
      return null;
  }
}

function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

export const billingService = {
  listPlans() {
    return Object.values(PRICING_PLANS);
  },

  async getMyBilling(userId: string) {
    const access = await accessPolicyService.getUserAccess(userId);
    const plan = getPlanBySubscriptionPlan(access.plan);
    const limits = plan.limits;
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${today}T00:00:00.000Z`);

    const [
      aiMessagesUsedToday,
      aiGenerationsUsed,
      heavyGenerationsUsed,
      projectsUsed,
      generationsByFeature,
    ] = await Promise.all([
      prisma.aIGeneration.count({
        where: {
          userId,
          featureCode: 'ai_chat',
          status: 'SUCCEEDED',
          createdAt: { gte: todayStart },
        },
      }),
      prisma.aIGeneration.count({
        where: {
          userId,
          billingPeriodId: access.billingPeriod.id,
          status: 'SUCCEEDED',
        },
      }),
      prisma.aIGeneration.count({
        where: {
          userId,
          billingPeriodId: access.billingPeriod.id,
          generationClass: { in: ['HEAVY', 'EXTREME'] },
          status: 'SUCCEEDED',
        },
      }),
      prisma.project.count({ where: { userId } }),
      prisma.aIGeneration.groupBy({
        by: ['featureCode'],
        where: {
          userId,
          billingPeriodId: access.billingPeriod.id,
          status: 'SUCCEEDED',
        },
        _count: { _all: true },
      }),
    ]);

    const contentUnitsUsed = generationsByFeature.reduce((sum, item) => {
      const action = featureToUsageAction(item.featureCode);
      return sum + (action ? (CONTENT_UNIT_COSTS[action] ?? 0) * item._count._all : 0);
    }, 0);

    const youtubeScriptsUsed = generationsByFeature
      .filter((item) => item.featureCode === 'video_script')
      .reduce((sum, item) => sum + item._count._all, 0);

    const longreadsUsed = generationsByFeature
      .filter((item) => item.featureCode === 'article' || item.featureCode === 'lead_magnet')
      .reduce((sum, item) => sum + item._count._all, 0);

    const strategyRebuildsUsed = generationsByFeature
      .filter((item) => ['positioning', 'audience', 'utp', 'jtbd'].includes(item.featureCode))
      .reduce((sum, item) => sum + item._count._all, 0);

    return {
      plan: {
        id: plan.id,
        scenario: plan.scenario,
        name: plan.name,
        priceMonthlyRub: plan.priceMonthlyRub,
        subscriptionStatus: access.subscription?.status?.toLowerCase() ?? 'active',
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
      },
      limits,
      usage: {
        creditsUsed: access.billingPeriod.creditsUsed,
        creditsRemaining: remaining(limits.monthlyCredits, access.billingPeriod.creditsUsed),
        contentUnitsUsed,
        contentUnitsRemaining: remaining(limits.monthlyContentUnits, contentUnitsUsed),
        aiMessagesUsedToday,
        aiMessagesRemainingToday: remaining(limits.dailyAiMessagesLimit, aiMessagesUsedToday),
        aiGenerationsUsed,
        aiGenerationsRemaining: remaining(limits.monthlyAiGenerationsLimit, aiGenerationsUsed),
        heavyGenerationsUsed,
        heavyGenerationsRemaining: remaining(limits.heavyGenerationsLimit, heavyGenerationsUsed),
        strategyRebuildsUsed,
        strategyRebuildsRemaining: remaining(limits.strategyRebuildsLimit, strategyRebuildsUsed),
        youtubeScriptsUsed,
        youtubeScriptsRemaining: remaining(limits.youtubeScriptsLimit, youtubeScriptsUsed),
        longreadsUsed,
        longreadsRemaining: remaining(limits.longreadsLimit, longreadsUsed),
        projectsUsed,
        projectsRemaining: remaining(limits.projectsLimit, projectsUsed),
      },
      period: {
        currentPeriodStart: access.billingPeriod.periodStart,
        currentPeriodEnd: access.billingPeriod.periodEnd,
      },
    };
  },
};
