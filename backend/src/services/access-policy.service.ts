import { GenerationClass, Prisma, Subscription, SubscriptionPlan } from '@prisma/client';
import { PLAN_LIMITS, FeatureCode, PlanLimitConfig } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { billingPeriodService } from './billing-period.service';
import { creditLedgerService } from './credit-ledger.service';
import { featurePricingService } from './feature-pricing.service';
import { aiBalanceService } from './ai-balance.service';

export class AccessPolicyError extends Error {
  status: number;
  code: string;
  limitType?: string;
  current?: number;
  limit?: number;
  planId?: string;

  constructor(
    message: string,
    status = 403,
    code = 'ACCESS_DENIED',
    details: { limitType?: string; current?: number; limit?: number; planId?: string } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.limitType = details.limitType;
    this.current = details.current;
    this.limit = details.limit;
    this.planId = details.planId;
  }
}

function isActiveSubscription(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'ACTIVE') return false;
  return !subscription.expiresAt || subscription.expiresAt >= new Date();
}

function mergeLimitOverrides(base: PlanLimitConfig, subscription: Subscription | null): PlanLimitConfig {
  const raw = subscription?.limitOverrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const overrides = raw as Partial<PlanLimitConfig> & { features?: Record<string, boolean> };
  return {
    ...base,
    monthlyCredits: typeof overrides.monthlyCredits === 'number' ? overrides.monthlyCredits : base.monthlyCredits,
    projectLimit: typeof overrides.projectLimit === 'number' ? overrides.projectLimit : base.projectLimit,
    heavyGenerationLimit: typeof overrides.heavyGenerationLimit === 'number' ? overrides.heavyGenerationLimit : base.heavyGenerationLimit,
    chatDailyLimit: typeof overrides.chatDailyLimit === 'number' ? overrides.chatDailyLimit : base.chatDailyLimit,
    dailyGenerationLimit: typeof overrides.dailyGenerationLimit === 'number' ? overrides.dailyGenerationLimit : base.dailyGenerationLimit,
    monthlyGenerationLimit: typeof overrides.monthlyGenerationLimit === 'number' ? overrides.monthlyGenerationLimit : base.monthlyGenerationLimit,
    monthlyContentUnits: typeof overrides.monthlyContentUnits === 'number' ? overrides.monthlyContentUnits : base.monthlyContentUnits,
    teamMembersLimit: typeof overrides.teamMembersLimit === 'number' ? overrides.teamMembersLimit : base.teamMembersLimit,
    strategyRebuildsLimit: typeof overrides.strategyRebuildsLimit === 'number' ? overrides.strategyRebuildsLimit : base.strategyRebuildsLimit,
    youtubeScriptsLimit: typeof overrides.youtubeScriptsLimit === 'number' ? overrides.youtubeScriptsLimit : base.youtubeScriptsLimit,
    longreadsLimit: typeof overrides.longreadsLimit === 'number' ? overrides.longreadsLimit : base.longreadsLimit,
    hasMarketingSupport: typeof overrides.hasMarketingSupport === 'boolean' ? overrides.hasMarketingSupport : base.hasMarketingSupport,
    marketingCallsPerMonth: typeof overrides.marketingCallsPerMonth === 'number' ? overrides.marketingCallsPerMonth : base.marketingCallsPerMonth,
    hasPrioritySupport: typeof overrides.hasPrioritySupport === 'boolean' ? overrides.hasPrioritySupport : base.hasPrioritySupport,
    hasTeamAccess: typeof overrides.hasTeamAccess === 'boolean' ? overrides.hasTeamAccess : base.hasTeamAccess,
    hasImplementationSupport: typeof overrides.hasImplementationSupport === 'boolean' ? overrides.hasImplementationSupport : base.hasImplementationSupport,
    features: overrides.features ? { ...base.features, ...overrides.features } : base.features,
  };
}

function limitExceeded(params: {
  message: string;
  limitType: string;
  current: number;
  limit: number;
  planId: string;
  status?: number;
}) {
  return new AccessPolicyError(params.message, params.status ?? 402, 'LIMIT_EXCEEDED', {
    limitType: params.limitType,
    current: params.current,
    limit: params.limit,
    planId: params.planId,
  });
}

export const accessPolicyService = {
  async assertProjectOwner(userId: string, projectId?: string | null): Promise<void> {
    if (!projectId) return;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new AccessPolicyError('Проект не найден', 404, 'PROJECT_NOT_FOUND');
    if (project.userId !== userId) throw new AccessPolicyError('Доступ к проекту запрещен', 403, 'PROJECT_FORBIDDEN');
  },

  async getUserAccess(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscription: true,
        _count: { select: { projects: true } },
      },
    });
    if (!user) throw new AccessPolicyError('Пользователь не найден', 404, 'USER_NOT_FOUND');

    const subscription = user.subscription;
    const plan = isActiveSubscription(subscription) ? subscription!.plan : 'START';
    const limits = mergeLimitOverrides(PLAN_LIMITS[plan as SubscriptionPlan], subscription);
    const billingPeriod = await billingPeriodService.getOrCreateCurrent(userId, subscription);
    const creditBalance = await creditLedgerService.getBalance(userId);

    return {
      user,
      subscription,
      plan,
      limits,
      billingPeriod,
      creditBalance,
    };
  },

  async assertCanUseFeature(input: {
    userId: string;
    projectId?: string | null;
    featureCode: FeatureCode;
    estimatedCredits?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    await accessPolicyService.assertProjectOwner(input.userId, input.projectId);
    const access = await accessPolicyService.getUserAccess(input.userId);

    if (access.user.role === 'ADMIN') {
      return { ...access, allowed: true, requiredCredits: 0 };
    }

    if (!access.limits.features[input.featureCode]) {
      throw new AccessPolicyError('Эта функция недоступна на вашем тарифе', 402, 'FEATURE_NOT_AVAILABLE', { planId: access.plan });
    }

    if (access.user._count.projects > access.limits.projectLimit) {
      throw limitExceeded({
        message: 'Превышен лимит проектов на тарифе',
        limitType: 'projectsLimit',
        current: access.user._count.projects,
        limit: access.limits.projectLimit,
        planId: access.plan,
      });
    }

    const pricing = await featurePricingService.resolve(input.featureCode);
    await aiBalanceService.assertEnough({
      userId: input.userId,
      billingPeriodId: access.billingPeriod.id,
      total: access.limits.monthlyCredits,
      featureCode: input.featureCode,
      metadata: input.metadata,
      planId: access.plan,
    });

    return { ...access, allowed: true, requiredCredits: input.estimatedCredits ?? pricing.creditPrice };
  },

  async assertRollingLimits(input: {
    userId: string;
    featureCode: FeatureCode;
    generationClass: GenerationClass;
    chatDailyLimit: number;
    dailyGenerationLimit: number;
    monthlyGenerationLimit: number;
    heavyGenerationLimit: number;
    billingPeriodId: string;
    planId: string;
    monthlyContentUnits: number;
    youtubeScriptsLimit: number;
    longreadsLimit: number;
  }): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${today}T00:00:00.000Z`);

    const [dailyCount, monthlyCount] = await Promise.all([
      prisma.aIGeneration.count({
        where: {
          userId: input.userId,
          status: 'SUCCEEDED',
          createdAt: { gte: todayStart },
        },
      }),
      prisma.aIGeneration.count({
        where: {
          userId: input.userId,
          billingPeriodId: input.billingPeriodId,
          status: 'SUCCEEDED',
        },
      }),
    ]);

    if (dailyCount >= input.dailyGenerationLimit) {
      throw limitExceeded({
        message: 'Дневной лимит AI-генераций исчерпан',
        limitType: 'dailyAiMessagesLimit',
        current: dailyCount,
        limit: input.dailyGenerationLimit,
        planId: input.planId,
        status: 429,
      });
    }

    if (monthlyCount >= input.monthlyGenerationLimit) {
      throw limitExceeded({
        message: 'Месячный лимит AI-генераций исчерпан',
        limitType: 'monthlyAiGenerationsLimit',
        current: monthlyCount,
        limit: input.monthlyGenerationLimit,
        planId: input.planId,
        status: 429,
      });
    }

    if (input.featureCode === 'ai_chat') {
      const chatToday = await prisma.aIGeneration.count({
        where: {
          userId: input.userId,
          featureCode: 'ai_chat',
          status: 'SUCCEEDED',
          createdAt: { gte: todayStart },
        },
      });
      if (chatToday >= input.chatDailyLimit) {
        throw limitExceeded({
          message: 'Дневной лимит AI-диалога исчерпан',
          limitType: 'dailyAiMessagesLimit',
          current: chatToday,
          limit: input.chatDailyLimit,
          planId: input.planId,
          status: 429,
        });
      }
    }

    void input.generationClass;
    void input.heavyGenerationLimit;
    void input.monthlyContentUnits;
    void input.youtubeScriptsLimit;
    void input.longreadsLimit;
  },
};
