import { GenerationClass, Subscription, SubscriptionPlan } from '@prisma/client';
import { PLAN_LIMITS, FeatureCode } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { billingPeriodService } from './billing-period.service';
import { creditLedgerService } from './credit-ledger.service';
import { featurePricingService } from './feature-pricing.service';

export class AccessPolicyError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = 'ACCESS_DENIED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isActiveSubscription(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'ACTIVE') return false;
  return !subscription.expiresAt || subscription.expiresAt >= new Date();
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
    const plan = isActiveSubscription(subscription) ? subscription!.plan : 'FREE';
    const limits = PLAN_LIMITS[plan as SubscriptionPlan];
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
  }) {
    await accessPolicyService.assertProjectOwner(input.userId, input.projectId);
    const access = await accessPolicyService.getUserAccess(input.userId);

    if (access.user.role === 'ADMIN') {
      return { ...access, allowed: true, requiredCredits: 0 };
    }

    if (!access.limits.features[input.featureCode]) {
      throw new AccessPolicyError('Эта функция недоступна на вашем тарифе', 402, 'FEATURE_NOT_AVAILABLE');
    }

    if (access.user._count.projects > access.limits.projectLimit) {
      throw new AccessPolicyError('Превышен лимит проектов на тарифе', 402, 'PROJECT_LIMIT_EXCEEDED');
    }

    const pricing = await featurePricingService.resolve(input.featureCode);
    const requiredCredits = input.estimatedCredits ?? pricing.creditPrice;
    if (access.creditBalance < requiredCredits) {
      throw new AccessPolicyError('Недостаточно credits для генерации', 402, 'INSUFFICIENT_CREDITS');
    }

    await accessPolicyService.assertRollingLimits({
      userId: input.userId,
      featureCode: input.featureCode,
      generationClass: pricing.generationClass,
      chatDailyLimit: access.limits.chatDailyLimit,
      heavyGenerationLimit: access.limits.heavyGenerationLimit,
      billingPeriodId: access.billingPeriod.id,
    });

    return { ...access, allowed: true, requiredCredits };
  },

  async assertRollingLimits(input: {
    userId: string;
    featureCode: FeatureCode;
    generationClass: GenerationClass;
    chatDailyLimit: number;
    heavyGenerationLimit: number;
    billingPeriodId: string;
  }): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    if (input.featureCode === 'ai_chat') {
      const chatToday = await prisma.aIGeneration.count({
        where: {
          userId: input.userId,
          featureCode: 'ai_chat',
          status: 'SUCCEEDED',
          createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
      });
      if (chatToday >= input.chatDailyLimit) {
        throw new AccessPolicyError('Дневной лимит AI-диалога исчерпан', 429, 'CHAT_DAILY_LIMIT');
      }
    }

    if (input.generationClass === 'HEAVY' || input.generationClass === 'EXTREME') {
      const heavyInPeriod = await prisma.aIGeneration.count({
        where: {
          userId: input.userId,
          billingPeriodId: input.billingPeriodId,
          generationClass: { in: ['HEAVY', 'EXTREME'] },
          status: 'SUCCEEDED',
        },
      });
      if (heavyInPeriod >= input.heavyGenerationLimit) {
        throw new AccessPolicyError('Лимит тяжелых генераций на период исчерпан', 429, 'HEAVY_LIMIT');
      }
    }
  },
};
