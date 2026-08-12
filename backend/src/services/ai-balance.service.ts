import { Prisma } from '@prisma/client';
import {
  AI_ACTION_LABELS,
  AI_ACTION_SECTIONS,
  CASTDEV_ANALYSIS_PRICING_POLICY,
  CASTDEV_TRANSCRIPTION_PRICING_POLICY,
  aiPointsForGeneration,
  aiPointsForFeature,
  featureCodeToAiAction,
  pointsFromTierPolicy,
} from '../config/ai-actions';
import { prisma } from '../lib/prisma';
import { actionKeyForFeature } from '../config/ai-action-registry';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiPointLedgerService } from './ai-point-ledger.service';

type Tx = Prisma.TransactionClient;

function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

function metadataNumber(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function pointsForGeneration(input: {
  featureCode: string;
  actionKey?: string;
  metadata?: unknown;
  createdAt?: Date;
}): Promise<number> {
  if (!(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) {
    return aiPointsForGeneration(input.featureCode, input.metadata);
  }
  if (input.featureCode === 'castdev_transcription' || input.featureCode === 'castdev_analysis' || input.featureCode === 'cases_extract_case') {
    const actionKey = input.featureCode as 'castdev_transcription' | 'castdev_analysis' | 'cases_extract_case';
    const pricing = await aiActionRegistryService.resolve(actionKey, input.createdAt ?? new Date());
    const pricingMetadata = pricing.pricingMetadata
      && typeof pricing.pricingMetadata === 'object'
      && !Array.isArray(pricing.pricingMetadata)
      ? pricing.pricingMetadata as Record<string, unknown>
      : {};
    const policyValue = pricingMetadata.pricingPolicy;
    const fallbackPolicy = actionKey === 'castdev_transcription'
      ? CASTDEV_TRANSCRIPTION_PRICING_POLICY
      : CASTDEV_ANALYSIS_PRICING_POLICY;
    const policy = policyValue
      && typeof policyValue === 'object'
      && !Array.isArray(policyValue)
      && (policyValue as Record<string, unknown>).mode === 'tiered'
      && Array.isArray((policyValue as Record<string, unknown>).tiers)
      ? policyValue as typeof fallbackPolicy
      : fallbackPolicy;
    const metricValue = actionKey === 'castdev_transcription'
      ? metadataNumber(input.metadata, 'durationSec')
      : metadataNumber(input.metadata, 'transcriptChars');
    return pointsFromTierPolicy(metricValue, policy);
  }
  const actionKey = input.actionKey && input.actionKey in AI_ACTION_LABELS
    ? input.actionKey
    : actionKeyForFeature(input.featureCode);
  return (await aiActionRegistryService.resolve(
    actionKey as Parameters<typeof aiActionRegistryService.resolve>[0],
    input.createdAt ?? new Date(),
  )).aiPoints;
}

export const aiBalanceService = {
  aiPointsForFeature,
  aiPointsForGeneration,
  resolvePointsForGeneration: pointsForGeneration,

  async getUsedInPeriod(input: {
    userId: string;
    billingPeriodId: string;
  }, tx: Tx = prisma): Promise<number> {
    if (await aiFeatureFlagsService.isEnabled('AI_POINTS_V2')) {
      const totals = await tx.creditLedgerEntry.groupBy({
        by: ['type'],
        where: {
          userId: input.userId,
          billingPeriodId: input.billingPeriodId,
          unit: 'AI_POINT',
          type: { in: ['CAPTURE', 'REFUND'] },
        },
        _sum: { quantity: true },
      });
      const captured = totals.find((item) => item.type === 'CAPTURE')?._sum.quantity ?? 0;
      const refunded = totals.find((item) => item.type === 'REFUND')?._sum.quantity ?? 0;
      return Math.max(0, captured - refunded);
    }
    const generations = await tx.aIGeneration.findMany({
      where: {
        userId: input.userId,
        billingPeriodId: input.billingPeriodId,
        status: 'SUCCEEDED',
      },
      select: { featureCode: true, metadata: true, createdAt: true },
    });

    const points = await Promise.all(generations.map((generation) => pointsForGeneration(generation)));
    return points.reduce((sum, value) => sum + value, 0);
  },

  async assertEnough(input: {
    userId: string;
    billingPeriodId: string;
    total: number;
    featureCode: string;
    metadata?: unknown;
    planId: string;
  }): Promise<void> {
    if (await aiFeatureFlagsService.isEnabled('AI_POINTS_V2')) {
      const current = await aiPointLedgerService.getState(input.userId, input.billingPeriodId);
      const required = await pointsForGeneration({
        featureCode: input.featureCode,
        metadata: input.metadata,
      });
      if (current.available < required) {
        throw Object.assign(new Error('AI-баланс закончился'), {
          status: 402,
          code: 'AI_BALANCE_EXHAUSTED',
          limitType: 'aiBalance',
          current: current.available,
          limit: input.total,
          planId: input.planId,
        });
      }
      return;
    }
    const used = await aiBalanceService.getUsedInPeriod({
      userId: input.userId,
      billingPeriodId: input.billingPeriodId,
    });
    const required = await pointsForGeneration({
      featureCode: input.featureCode,
      metadata: input.metadata,
    });
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
    if (await aiFeatureFlagsService.isEnabled('AI_POINTS_V2')) {
      const [capture, current, aiBalanceUsed] = await Promise.all([
        prisma.creditLedgerEntry.findFirst({
          where: {
            userId: input.userId,
            billingPeriodId: input.billingPeriodId,
            unit: 'AI_POINT',
            type: 'CAPTURE',
            generation: {
              featureCode: input.featureCode,
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        aiPointLedgerService.getState(input.userId, input.billingPeriodId),
        aiBalanceService.getUsedInPeriod({
          userId: input.userId,
          billingPeriodId: input.billingPeriodId,
        }),
      ]);
      return {
        aiPointsCharged: capture?.quantity ?? 0,
        aiBalanceUsed,
        aiBalanceRemaining: current.available,
      };
    }
    const aiPointsCharged = await pointsForGeneration({
      featureCode: input.featureCode,
      metadata: input.metadata,
    });
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
    if (await aiFeatureFlagsService.isEnabled('AI_POINTS_V2')) {
      const entries = await prisma.creditLedgerEntry.findMany({
        where: {
          userId: input.userId,
          billingPeriodId: input.billingPeriodId,
          unit: 'AI_POINT',
          type: { in: ['CAPTURE', 'REFUND'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 400,
        select: {
          id: true,
          generationId: true,
          projectId: true,
          type: true,
          quantity: true,
          actionKey: true,
          createdAt: true,
          generation: {
            select: {
              featureCode: true,
            },
          },
        },
      });
      const refunds = new Map<string, number>();
      for (const entry of entries) {
        if (entry.type === 'REFUND' && entry.generationId) {
          refunds.set(entry.generationId, (refunds.get(entry.generationId) ?? 0) + entry.quantity);
        }
      }
      return entries
        .filter((entry) => entry.type === 'CAPTURE')
        .slice(0, input.limit ?? 30)
        .map((entry) => {
          const featureCode = entry.generation?.featureCode ?? entry.actionKey ?? 'ai_chat';
          const actionType = featureCodeToAiAction(featureCode);
          return {
            id: entry.id,
            projectId: entry.projectId,
            actionLabel: AI_ACTION_LABELS[actionType],
            sectionLabel: AI_ACTION_SECTIONS[actionType],
            aiPointsCharged: Math.max(0, entry.quantity - (refunds.get(entry.generationId ?? '') ?? 0)),
            createdAt: entry.createdAt,
          };
        });
    }
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

    const points = await Promise.all(generations.map((generation) => pointsForGeneration(generation)));
    const items = generations.map((generation, index) => {
      const actionType = featureCodeToAiAction(generation.featureCode);
      return {
        id: generation.id,
        projectId: generation.projectId,
        featureCode: generation.featureCode,
        metadata: generation.metadata,
        actionLabel: AI_ACTION_LABELS[actionType],
        sectionLabel: AI_ACTION_SECTIONS[actionType],
        aiPointsCharged: points[index] ?? 0,
        createdAt: generation.createdAt,
      };
    });

    const grouped = new Map<string, typeof items[number]>();
    const result: typeof items = [];

    for (const item of items) {
      const workflow = metadataText(item.metadata, 'workflow');
      const shouldGroupProductBuild =
        (workflow === 'product.main' || workflow === 'product.mini' || workflow === 'leadmagnet' || workflow.startsWith('leadmagnet.')) &&
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
