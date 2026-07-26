import { AIProvider, AIGenerationStatus, Prisma } from '@prisma/client';
import { FeatureCode } from '../config/ai-economy';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiCostService, MissingModelPricingError, TokenUsage } from './ai-cost.service';
import { billingPeriodService } from './billing-period.service';
import { creditLedgerService } from './credit-ledger.service';
import { featurePricingService } from './feature-pricing.service';
import { aiBalanceService } from './ai-balance.service';
import { providerCallAccountingService } from './provider-call-accounting.service';
import { aiPointLedgerService } from './ai-point-ledger.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { actionKeyForFeature, AI_ACTION_DEFINITIONS } from '../config/ai-action-registry';
import type { AIActionKey } from '../config/ai-action-registry';

function actionKeyFromMetadata(featureCode: string, metadata: Prisma.JsonValue | null): AIActionKey {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const candidate = (metadata as Prisma.JsonObject).actionKey;
    if (typeof candidate === 'string' && candidate in AI_ACTION_DEFINITIONS) {
      return candidate as AIActionKey;
    }
  }
  return actionKeyForFeature(featureCode);
}

export interface RunAIGenerationInput<T> {
  userId: string;
  projectId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  featureCode: FeatureCode;
  actionKey?: AIActionKey;
  provider: AIProvider;
  model: string;
  requestHash?: string;
  idempotencyKey?: string;
  promptVersion?: string;
  contextVersion?: string;
  metadata?: Prisma.InputJsonValue;
  deferAiPointCapture?: boolean;
  execute: (context: { generationId: string }) => Promise<{
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
    const totalTokens = usage.inputTokens + usage.outputTokens + (usage.audioInputTokens ?? 0) + (usage.audioOutputTokens ?? 0);
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
        reasoningTokens: usage.reasoningTokens ?? 0,
        audioInputTokens: usage.audioInputTokens ?? 0,
        audioOutputTokens: usage.audioOutputTokens ?? 0,
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
    aiPointsPending: boolean;
  }> {
    const pricing = await featurePricingService.resolve(input.featureCode);
    const aiPointsV2 = await aiFeatureFlagsService.isEnabled('AI_POINTS_V2');
    const actionKey = input.actionKey ?? actionKeyForFeature(input.featureCode);
    const aiPointsToReserve = aiPointsV2
      ? await aiBalanceService.resolvePointsForGeneration({
        featureCode: input.featureCode,
        actionKey,
        metadata: input.metadata,
      })
      : 0;

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
        creditsReserved: aiPointsV2 ? 0 : pricing.creditPrice,
        aiPointsReserved: aiPointsToReserve,
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

    const startedAt = Date.now();

    try {
      if (aiPointsV2) {
        await aiPointLedgerService.reserve({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          generationId: generation.id,
          actionKey,
          points: aiPointsToReserve,
          idempotencyKey: input.idempotencyKey ?? generation.id,
          metadata: input.metadata,
        });
      } else {
        await creditLedgerService.reserve({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: pricing.creditPrice,
          reason: `Reserve ${input.featureCode}`,
          generationId: generation.id,
        });
      }
    } catch (error) {
      await prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          errorCode: 'BALANCE_RESERVE_FAILED',
          errorMessage: error instanceof Error ? error.message : 'AI balance reserve failed',
          finishedAt: new Date(),
        },
      }).catch(() => undefined);
      throw error;
    }

    try {
      let aiPointsPending = false;
      const executed = await input.execute({ generationId: generation.id });
      const provider = executed.provider ?? input.provider;
      const model = executed.model ?? input.model;
      const providerAggregate = await providerCallAccountingService.aggregateForGeneration(generation.id);
      const accountedUsage = providerAggregate?.usage ?? executed.usage;
      const totalTokens = accountedUsage.inputTokens
        + accountedUsage.outputTokens
        + (accountedUsage.audioInputTokens ?? 0)
        + (accountedUsage.audioOutputTokens ?? 0);
      const creditsCharged = featurePricingService.calculateCredits(pricing, totalTokens);
      const refund = Math.max(0, pricing.creditPrice - creditsCharged);
      const extraCharge = Math.max(0, creditsCharged - pricing.creditPrice);
      const fallbackCost = providerAggregate
        ? null
        : await aiCostService.calculate({ provider, model, usage: accountedUsage });
      const actualCostUsd = providerAggregate?.actualCostUsd ?? fallbackCost!.actualCostUsd;
      const pricingSnapshot = providerAggregate?.pricingSnapshot ?? fallbackCost!.pricingSnapshot;

      if (!aiPointsV2 && extraCharge > 0) {
        await creditLedgerService.consume({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: extraCharge,
          reason: `Extra charge ${input.featureCode}`,
          generationId: generation.id,
        });
      } else if (!aiPointsV2 && refund > 0) {
        await creditLedgerService.refund({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: refund,
          reason: `Refund ${input.featureCode}`,
          generationId: generation.id,
        });
      }

      const generationSuccessData = {
        provider,
        model,
        status: 'SUCCEEDED' as AIGenerationStatus,
        inputTokens: accountedUsage.inputTokens,
        outputTokens: accountedUsage.outputTokens,
        cachedInputTokens: accountedUsage.cachedInputTokens ?? 0,
        reasoningTokens: accountedUsage.reasoningTokens ?? 0,
        audioInputTokens: accountedUsage.audioInputTokens ?? 0,
        audioOutputTokens: accountedUsage.audioOutputTokens ?? 0,
        totalTokens,
        actualCostUsd,
        creditsCharged: aiPointsV2 ? 0 : creditsCharged,
        creditsRefunded: aiPointsV2 ? 0 : refund,
        aiPointsCaptured: aiPointsV2 ? aiPointsToReserve : 0,
        latencyMs: Date.now() - startedAt,
        retryCount: providerAggregate?.retryCount ?? 0,
        pricingSnapshot,
        finishedAt: new Date(),
      };
      const usageEventData = {
        userId: input.userId,
        projectId: input.projectId ?? null,
        generationId: generation.id,
        eventType: 'SUCCEEDED' as const,
        featureCode: input.featureCode,
        provider,
        model,
        creditsDelta: aiPointsV2 ? 0 : -creditsCharged,
        costUsd: actualCostUsd,
        tokensInput: accountedUsage.inputTokens,
        tokensOutput: accountedUsage.outputTokens,
        metadata: {
          accountingVersion: aiPointsV2 ? 'ai-points-v2' : 'legacy',
          aiPointsCaptured: aiPointsV2 ? aiPointsToReserve : 0,
          providerCallsCount: providerAggregate?.callsCount ?? 0,
          cachedInputTokens: accountedUsage.cachedInputTokens ?? 0,
          reasoningTokens: accountedUsage.reasoningTokens ?? 0,
          audioInputTokens: accountedUsage.audioInputTokens ?? 0,
          audioOutputTokens: accountedUsage.audioOutputTokens ?? 0,
        },
      };

      let aiPointsCharged: number;
      let aiBalanceRemaining: number;
      if (aiPointsV2 && input.deferAiPointCapture) {
        await prisma.aIGeneration.update({
          where: { id: generation.id },
          data: {
            ...generationSuccessData,
            status: 'RUNNING',
            aiPointsCaptured: 0,
            errorCode: 'AWAITING_RESULT_PERSISTENCE',
            errorMessage: null,
            finishedAt: null,
          },
        });
        const pointState = await aiPointLedgerService.getState(input.userId, access.billingPeriod.id);
        aiPointsCharged = 0;
        aiBalanceRemaining = pointState.available;
        aiPointsPending = true;
      } else if (aiPointsV2) {
        const capture = await aiPointLedgerService.captureWithPersistence({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          generationId: generation.id,
          actionKey,
          metadata: input.metadata,
        }, async (tx, capturedPoints) => {
          await tx.aIGeneration.update({
            where: { id: generation.id },
            data: { ...generationSuccessData, aiPointsCaptured: capturedPoints },
          });
          await tx.billingPeriod.update({
            where: { id: access.billingPeriod.id },
            data: { costTotalUsd: { increment: actualCostUsd } },
          });
          await tx.aIUsageEvent.create({
            data: {
              ...usageEventData,
              metadata: {
                ...usageEventData.metadata,
                aiPointsCaptured: capturedPoints,
              },
            },
          });
        });
        aiPointsCharged = capture.quantity;
        aiBalanceRemaining = capture.availableAfter;
      } else {
        await prisma.$transaction([
          prisma.aIGeneration.update({
            where: { id: generation.id },
            data: generationSuccessData,
          }),
          prisma.billingPeriod.update({
            where: { id: access.billingPeriod.id },
            data: {
              creditsUsed: { increment: creditsCharged },
              costTotalUsd: { increment: actualCostUsd },
            },
          }),
          prisma.aIUsageEvent.create({ data: usageEventData }),
        ]);
        const aiCharge = await aiBalanceService.chargeAiBalance({
          userId: input.userId,
          billingPeriodId: access.billingPeriod.id,
          total: access.limits.monthlyCredits,
          featureCode: input.featureCode,
          metadata: input.metadata,
        });
        aiPointsCharged = aiCharge.aiPointsCharged;
        aiBalanceRemaining = aiCharge.aiBalanceRemaining;
      }

      return {
        result: executed.result,
        generationId: generation.id,
        creditsCharged: aiPointsV2 ? 0 : creditsCharged,
        actualCostUsd: actualCostUsd.toString(),
        aiPointsCharged,
        aiBalanceRemaining,
        aiPointsPending,
      };
    } catch (err) {
      if (aiPointsV2) {
        await aiPointLedgerService.release({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          generationId: generation.id,
          actionKey,
          reason: `Failed ${input.featureCode}`,
          metadata: input.metadata,
        }).catch(() => {});
      } else {
        await creditLedgerService.refund({
          userId: input.userId,
          projectId: input.projectId ?? null,
          billingPeriodId: access.billingPeriod.id,
          amount: pricing.creditPrice,
          reason: `Failed ${input.featureCode}`,
          generationId: generation.id,
        }).catch(() => {});
      }

      await prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED' as AIGenerationStatus,
          aiPointsReserved: aiPointsV2 ? aiPointsToReserve : 0,
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

  async finalizeDeferredAiPoints(input: {
    generationId: string;
    userId: string;
  }): Promise<{ aiPointsCharged: number; aiBalanceRemaining: number }> {
    const generation = await prisma.aIGeneration.findFirst({
      where: { id: input.generationId, userId: input.userId },
    });
    if (!generation?.billingPeriodId) throw new Error('AI_GENERATION_NOT_FOUND');
    const capture = await aiPointLedgerService.captureWithPersistence({
      userId: generation.userId,
      projectId: generation.projectId,
      billingPeriodId: generation.billingPeriodId,
      generationId: generation.id,
      actionKey: actionKeyFromMetadata(generation.featureCode, generation.metadata),
      metadata: generation.metadata ?? undefined,
    }, async (tx, capturedPoints) => {
      await tx.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'SUCCEEDED',
          aiPointsCaptured: capturedPoints,
          errorCode: null,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      await tx.billingPeriod.update({
        where: { id: generation.billingPeriodId! },
        data: { costTotalUsd: { increment: generation.actualCostUsd } },
      });
      await tx.aIUsageEvent.create({
        data: {
          userId: generation.userId,
          projectId: generation.projectId,
          generationId: generation.id,
          eventType: 'SUCCEEDED',
          featureCode: generation.featureCode,
          provider: generation.provider,
          model: generation.model,
          costUsd: generation.actualCostUsd,
          tokensInput: generation.inputTokens,
          tokensOutput: generation.outputTokens,
          metadata: {
            accountingVersion: 'ai-points-v2',
            aiPointsCaptured: capturedPoints,
            cachedInputTokens: generation.cachedInputTokens,
            reasoningTokens: generation.reasoningTokens,
            audioInputTokens: generation.audioInputTokens,
            audioOutputTokens: generation.audioOutputTokens,
          },
        },
      });
    });
    return {
      aiPointsCharged: capture.quantity,
      aiBalanceRemaining: capture.availableAfter,
    };
  },

  async failDeferredAiPoints(input: {
    generationId: string;
    userId: string;
    error: unknown;
  }): Promise<void> {
    const generation = await prisma.aIGeneration.findFirst({
      where: { id: input.generationId, userId: input.userId },
    });
    if (!generation?.billingPeriodId || generation.status === 'SUCCEEDED') return;
    const message = input.error instanceof Error ? input.error.message : 'Result persistence failed';
    await aiPointLedgerService.release({
      userId: generation.userId,
      projectId: generation.projectId,
      billingPeriodId: generation.billingPeriodId,
      generationId: generation.id,
      actionKey: actionKeyFromMetadata(generation.featureCode, generation.metadata),
      reason: message,
      metadata: { resultPersistenceFailed: true },
    });
    await prisma.$transaction([
      prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          errorCode: 'RESULT_PERSISTENCE_FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        },
      }),
      prisma.aIUsageEvent.create({
        data: {
          userId: generation.userId,
          projectId: generation.projectId,
          generationId: generation.id,
          eventType: 'FAILED',
          featureCode: generation.featureCode,
          provider: generation.provider,
          model: generation.model,
          metadata: { error: message, resultPersistenceFailed: true },
        },
      }),
    ]);
  },
};
