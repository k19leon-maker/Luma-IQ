import { Prisma } from '@prisma/client';
import {
  AI_ACTION_LABELS,
  AI_ACTION_SECTIONS,
  aiPointsForGeneration,
  aiPointsForFeature,
  featureCodeToAiAction,
} from '../config/ai-actions';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

export const aiBalanceService = {
  aiPointsForFeature,
  aiPointsForGeneration,

  async getUsedInPeriod(input: {
    userId: string;
    billingPeriodId: string;
  }, tx: Tx = prisma): Promise<number> {
    const generations = await tx.aIGeneration.findMany({
      where: {
        userId: input.userId,
        billingPeriodId: input.billingPeriodId,
        status: 'SUCCEEDED',
      },
      select: { featureCode: true, metadata: true },
    });

    return generations.reduce(
      (sum, generation) => sum + aiPointsForGeneration(generation.featureCode, generation.metadata),
      0,
    );
  },

  async assertEnough(input: {
    userId: string;
    billingPeriodId: string;
    total: number;
    featureCode: string;
    metadata?: unknown;
    planId: string;
  }): Promise<void> {
    const used = await aiBalanceService.getUsedInPeriod({
      userId: input.userId,
      billingPeriodId: input.billingPeriodId,
    });
    const required = aiPointsForGeneration(input.featureCode, input.metadata);
    if (used + required > input.total) {
      throw Object.assign(new Error('AI-баланс закончился'), {
        status: 402,
        code: 'AI_BALANCE_EXHAUSTED',
        limitType: 'aiBalance',
        current: used,
        limit: input.total,
        planId: input.planId,
      });
    }
  },

  async chargeAiBalance(input: {
    userId: string;
    billingPeriodId: string;
    total: number;
    featureCode: string;
    metadata?: unknown;
  }) {
    const aiPointsCharged = aiPointsForGeneration(input.featureCode, input.metadata);
    const aiBalanceUsed = await aiBalanceService.getUsedInPeriod({
      userId: input.userId,
      billingPeriodId: input.billingPeriodId,
    });

    return {
      aiPointsCharged,
      aiBalanceUsed,
      aiBalanceRemaining: remaining(input.total, aiBalanceUsed),
    };
  },

  async getHistory(input: {
    userId: string;
    billingPeriodId: string;
    limit?: number;
  }) {
    const generations = await prisma.aIGeneration.findMany({
      where: {
        userId: input.userId,
        billingPeriodId: input.billingPeriodId,
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        projectId: true,
        featureCode: true,
        metadata: true,
        createdAt: true,
      },
    });

    const items = generations.map((generation) => {
      const actionType = featureCodeToAiAction(generation.featureCode);
      return {
        id: generation.id,
        projectId: generation.projectId,
        featureCode: generation.featureCode,
        metadata: generation.metadata,
        actionLabel: AI_ACTION_LABELS[actionType],
        sectionLabel: AI_ACTION_SECTIONS[actionType],
        aiPointsCharged: aiPointsForGeneration(generation.featureCode, generation.metadata),
        createdAt: generation.createdAt,
      };
    });

    const grouped = new Map<string, typeof items[number]>();
    const result: typeof items = [];

    for (const item of items) {
      const workflow = metadataText(item.metadata, 'workflow');
      const shouldGroupProductBuild =
        (workflow === 'product.main' || workflow === 'product.mini' || workflow.startsWith('leadmagnet.')) &&
        metadataText(item.metadata, 'step') !== 'edit';

      if (!shouldGroupProductBuild) {
        result.push(item);
        continue;
      }

      const bucket = Math.floor(item.createdAt.getTime() / (90 * 60 * 1000));
      const key = `${item.projectId ?? 'no-project'}:${workflow}:${bucket}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.aiPointsCharged += item.aiPointsCharged;
        if (item.createdAt > existing.createdAt) existing.createdAt = item.createdAt;
      } else {
        const aggregate = { ...item };
        grouped.set(key, aggregate);
        result.push(aggregate);
      }
    }

    return result
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit ?? 30)
      .map(({ featureCode: _featureCode, metadata: _metadata, ...item }) => item);
  },

  buildPlanLimits(input: {
    planName: string;
    planStatus: string;
    aiBalanceTotal: number;
    aiBalanceUsed: number;
    projectsTotal: number;
    projectsUsed: number;
    limitsResetAt: Date | string | null;
  }) {
    return {
      planName: input.planName,
      planStatus: input.planStatus,
      aiBalanceTotal: input.aiBalanceTotal,
      aiBalanceUsed: input.aiBalanceUsed,
      aiBalanceRemaining: remaining(input.aiBalanceTotal, input.aiBalanceUsed),
      projectsTotal: input.projectsTotal,
      projectsUsed: input.projectsUsed,
      projectsRemaining: remaining(input.projectsTotal, input.projectsUsed),
      limitsResetAt: input.limitsResetAt,
    };
  },
};

function metadataText(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}
