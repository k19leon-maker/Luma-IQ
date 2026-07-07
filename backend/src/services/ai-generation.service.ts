import { AIProvider, AIGenerationStatus, Prisma } from '@prisma/client';
import { FeatureCode } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiCostService, MissingModelPricingError, TokenUsage } from './ai-cost.service';
import { billingPeriodService } from './billing-period.service';
import { creditLedgerService } from './credit-ledger.service';
import { featurePricingService } from './feature-pricing.service';
import { aiBalanceService } from './ai-balance.service';

export interface RunAIGenerationInput<T> {
  userId: string;
  projectId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  featureCode: FeatureCode;
  provider: AIProvider;
  model: string;
  requestHash?: string;
  idempotencyKey?: string;
  promptVersion?: string;
  contextVersion?: string;
  metadata?: Prisma.InputJsonValue;
  execute: () => Promise<{
    result: T;
    usage: TokenUsage;
    model?: string;
    provider?: AIProvider;
  }>;
}

export const aiGenerationService = {
  async startAccounting(input: {
    userId: string;
    projectId?: string | null;
    workflowRunId?: string | null;
    workflowStepId?: string | null;
    featureCode: FeatureCode;
    provider: AIProvider;
    model: string;
    requestHash?: string;
    promptVersion?: string;
    contextVersion?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const [pricing, subscription] = await Promise.all([
      featurePricingService.resolve(input.featureCode),
      prisma.subscription.findUnique({ where: { userId: input.userId } }),
    ]);
    const billingPeriod = await billingPeriodService.getOrCreateCurrent(input.userId, subscription);

    const projectId = input.projectId
      ? await prisma.project.findFirst({
        where: { id: input.projectId, userId: input.userId },
        select: { id: true },
      }).then((project) => project?.id ?? null)
      : null;

    const generation = await prisma.aIGeneration.create({
      data: {
        userId: input.userId,
        projectId,
        billingPeriodId: billingPeriod.id,
        workflowRunId: input.workflowRunId ?? null,
        workflowStepId: input.workflowStepId ?? null,
        featureCode: input.featureCode,
        featureGroup: pricing.featureGroup,
        generationClass: pricing.generationClass,
        provider: input.provider,
        model: input.model,
        status: 'RUNNING',
        requestHash: input.requestHash ?? null,
        promptVersion: input.promptVersion ?? null,
        contextVersion: input.contextVersion ?? null,
        metadata: input.metadata ?? undefined,
        startedAt: new Date(),
      },
    });

    await prisma.aIUsageEvent.create({
      data: {
        userId: input.userId,
        projectId,
        generationId: generation.id,
        eventType: 'STARTED',
        featureCode: input.featureCode,
        provider: input.provider,
        model: input.model,
      },
    });

    return { generation, billingPeriod };
  },

  async markSucceeded(input: {
    generationId: string;
    userId: string;
    projectId?: string | null;
    featureCode: FeatureCode;
    provider: AIProvider;
    model: string;
    startedAtMs: number;
    isMock: boolean;
    usage?: TokenUsage;
  }): Promise<void> {
    const usage = input.usage ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    const totalTokens = usage.inputTokens + usage.outputTokens + (usage.cachedInputTokens ?? 0);
    const cost = await aiCostService.calculate({ provider: input.provider, model: input.model, usage });

    await prisma.aIGeneration.update({
      where: { id: input.generationId },
      data: {
        provider: input.provider,
        model: input.model,
        status: 'SUCCEEDED',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        totalTokens,
        actualCostUsd: cost.actualCostUsd,
        pricingSnapshot: cost.pricingSnapshot,
        latencyMs: Date.now() - input.startedAtMs,
        metadata: { isMock: input.isMock },
        finishedAt: new Date(),
      },
    });

    await prisma.aIUsageEvent.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        generationId: input.generationId,
        eventType: 'SUCCEEDED',
        featureCode: input.featureCode,
        provider: input.provider,
        model: input.model,
        costUsd: cost.actualCostUsd,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
        metadata: { isMock: input.isMock },
      },
    });
  },

  async markFailed(input: {
    generationId: string;
    userId: string;
    projectId?: string | null;
    featureCode: FeatureCode;
    provider: AIProvider;
    model: string;
    startedAtMs: number;
    error: unknown;
  }): Promise<void> {
    const message = input.error instanceof Error ? input.error.message : 'unknown';

    await prisma.aIGeneration.update({
      where: { id: input.generationId },
      data: {
        status: 'FAILED',
        errorMessage: message,
        latencyMs: Date.now() - input.startedAtMs,
        finishedAt: new Date(),
      },
    }).catch(() => {});

    await prisma.aIUsageEvent.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        generationId: input.generationId,
        eventType: 'FAILED',
        featureCode: input.featureCode,
        provider: input.provider,
        model: input.model,
        metadata: { error: message },
      },
    }).catch(() => {});
  },

  async run<T>(input: RunAIGenerationInput<T>): Promise<{
    result: T;
    generationId: string;
    creditsCharged: number;
    actualCostUsd: string;
    aiPointsCharged: number;
    aiBalanceRemaining: number;
  }> {
    const pricing = await featurePricingService.resolve(input.featureCode);

    try {
      await aiCostService.assertPricingExists({ provider: input.provider, model: input.model });
    } catch (err) {
      if (err instanceof MissingModelPricingError) {
        await prisma.aIUsageEvent.create({
          data: {
            userId: input.userId,
            projectId: input.projectId ?? null,
            eventType: 'FAILED',
            featureCode: input.featureCode,
            provider: input.provider,
            model: input.model,
            metadata: {
              adminAlert: true,
              code: err.code,
              message: err.message,
            },
          },
        }).catch(() => {});
      }
      throw err;
    }

    if (input.idempotencyKey) {
      const existing = await prisma.aIGeneration.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing?.status === 'SUCCEEDED') {
        throw Object.assign(new Error('Повторный AI-запрос уже был успешно выполнен'), {
          status: 409,
          code: 'IDEMPOTENCY_REPLAY',
          generationId: existing.id,
        });
      }
      if (existing?.status === 'RUNNING') {
        throw Object.assign(new Error('Такой AI-запрос уже выполняется'), {
          status: 409,
          code: 'IDEMPOTENCY_IN_PROGRESS',
          generationId: existing.id,
        });
      }
    }

    const access = await accessPolicyService.assertCanUseFeature({
      userId: input.userId,
      projectId: input.projectId ?? null,
      featureCode: input.featureCode,
      estimatedCredits: pricing.creditPrice,
      metadata: input.metadata,
    });

    const generation = await prisma.aIGeneration.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        billingPeriodId: access.billingPeriod.id,
        workflowRunId: input.workflowRunId ?? null,
        workflowStepId: input.workflowStepId ?? null,
        featureCode: input.featureCode,
        featureGroup: pricing.featureGroup,
        generationClass: pricing.generationClass,
        provider: input.provider,
        model: input.model,
        status: 'RUNNING',
        requestHash: input.requestHash ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        creditsReserved: pricing.creditPrice,
        promptVersion: input.promptVersion ?? null,
        contextVersion: input.contextVersion ?? null,
        metadata: input.metadata ?? undefined,
        startedAt: new Date(),
      },
    });

    await prisma.aIUsageEvent.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        generationId: generation.id,
        eventType: 'STARTED',
        featureCode: input.featureCode,
        provider: input.provider,
        model: input.model,
      },
    });

    await creditLedgerService.reserve({
      userId: input.userId,
      projectId: input.projectId ?? null,
      billingPeriodId: access.billingPeriod.id,
      amount: pricing.creditPrice,
      reason: `Reserve ${input.featureCode}`,
      generationId: generation.id,
    });

    const startedAt = Date.now();

    try {
      const executed = await input.execute();
      const provider = executed.provider ?? input.provider;
      const model = executed.model ?? input.model;
      const totalTokens = executed.usage.inputTokens + executed.usage.outputTokens + (executed.usage.cachedInputTokens ?? 0);
      const creditsCharged = featurePricingService.calculateCredits(pricing, totalTokens);
      const refund = Math.max(0, pricing.creditPrice - creditsCharged);
      const extraCharge = Math.max(0, creditsCharged - pricing.creditPrice);
      const cost = await aiCostService.calculate({ provider, model, usage: executed.usage });

      if (extraCharge > 0) {
        await creditLedgerService.consume({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: extraCharge,
          reason: `Extra charge ${input.featureCode}`,
          generationId: generation.id,
        });
      } else if (refund > 0) {
        await creditLedgerService.refund({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: refund,
          reason: `Refund ${input.featureCode}`,
          generationId: generation.id,
        });
      }

      await prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          provider,
          model,
          status: 'SUCCEEDED',
          inputTokens: executed.usage.inputTokens,
          outputTokens: executed.usage.outputTokens,
          cachedInputTokens: executed.usage.cachedInputTokens ?? 0,
          totalTokens,
          actualCostUsd: cost.actualCostUsd,
          creditsCharged,
          creditsRefunded: refund,
          latencyMs: Date.now() - startedAt,
          pricingSnapshot: cost.pricingSnapshot,
          finishedAt: new Date(),
        },
      });

      await prisma.billingPeriod.update({
        where: { id: access.billingPeriod.id },
        data: {
          creditsUsed: { increment: creditsCharged },
          costTotalUsd: { increment: cost.actualCostUsd },
        },
      });

      await prisma.aIUsageEvent.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          generationId: generation.id,
          eventType: 'SUCCEEDED',
          featureCode: input.featureCode,
          provider,
          model,
          creditsDelta: -creditsCharged,
          costUsd: cost.actualCostUsd,
          tokensInput: executed.usage.inputTokens,
          tokensOutput: executed.usage.outputTokens,
        },
      });

      const aiCharge = await aiBalanceService.chargeAiBalance({
        userId: input.userId,
        billingPeriodId: access.billingPeriod.id,
        total: access.limits.monthlyCredits,
        featureCode: input.featureCode,
        metadata: input.metadata,
      });

      return {
        result: executed.result,
        generationId: generation.id,
        creditsCharged,
        actualCostUsd: cost.actualCostUsd.toString(),
        aiPointsCharged: aiCharge.aiPointsCharged,
        aiBalanceRemaining: aiCharge.aiBalanceRemaining,
      };
    } catch (err) {
      await creditLedgerService.refund({
        userId: input.userId,
        projectId: input.projectId ?? null,
        billingPeriodId: access.billingPeriod.id,
        amount: pricing.creditPrice,
        reason: `Failed ${input.featureCode}`,
        generationId: generation.id,
      }).catch(() => {});

      await prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED' as AIGenerationStatus,
          errorMessage: err instanceof Error ? err.message : 'unknown',
          latencyMs: Date.now() - startedAt,
          finishedAt: new Date(),
        },
      }).catch(() => {});

      await prisma.aIUsageEvent.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          generationId: generation.id,
          eventType: 'FAILED',
          featureCode: input.featureCode,
          provider: input.provider,
          model: input.model,
          metadata: { error: err instanceof Error ? err.message : 'unknown' },
        },
      }).catch(() => {});

      throw err;
    }
  },
};
