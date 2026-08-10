import { Prisma } from '@prisma/client';
import { getCastDevTranscriptionCost } from '../config/ai-actions';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiBalanceService } from './ai-balance.service';
import { featurePricingService } from './feature-pricing.service';
import { providerCallAccountingService } from './provider-call-accounting.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiPointLedgerService } from './ai-point-ledger.service';

function transcriptionModel(modelId?: string): string {
  return modelId ?? 'TRANSCRIBE_MINI';
}

function transcriptionMetadata(input: {
  recordId: string;
  durationSec: number | null;
  transcriptChars?: number;
  chunksCount?: number;
  fileName?: string;
  mimeType?: string;
  modelAlias?: string;
  modelId?: string;
}): Prisma.InputJsonValue {
  return {
    source: 'custdev',
    operation: 'transcription',
    recordId: input.recordId,
    durationSec: input.durationSec,
    transcriptChars: input.transcriptChars ?? null,
    chunksCount: input.chunksCount ?? null,
    fileName: input.fileName ?? null,
    mimeType: input.mimeType ?? null,
    transcriptionModelAlias: input.modelAlias ?? 'TRANSCRIBE_MINI',
    transcriptionModel: transcriptionModel(input.modelId),
    castdevAiPoints: getCastDevTranscriptionCost(input.durationSec),
  } as Prisma.InputJsonValue;
}

export const castDevBillingService = {
  async assertCanTranscribe(input: {
    userId: string;
    projectId: string;
    recordId: string;
    durationSec: number | null;
  }): Promise<void> {
    await accessPolicyService.assertCanUseFeature({
      userId: input.userId,
      projectId: input.projectId,
      featureCode: 'castdev_transcription',
      metadata: transcriptionMetadata({
        recordId: input.recordId,
        durationSec: input.durationSec,
      }),
    });
  },

  async beginTranscription(input: {
    userId: string;
    projectId: string;
    recordId: string;
    durationSec: number | null;
    startedAt: Date;
    modelAlias?: string;
    modelId?: string;
  }): Promise<{ generationId: string; billingPeriodId: string } | null> {
    if (!(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) {
      await castDevBillingService.assertCanTranscribe(input);
      return null;
    }
    const metadata = transcriptionMetadata(input);
    const [pricing, access, points] = await Promise.all([
      featurePricingService.resolve('castdev_transcription'),
      accessPolicyService.assertCanUseFeature({
        userId: input.userId,
        projectId: input.projectId,
        featureCode: 'castdev_transcription',
        metadata,
      }),
      aiBalanceService.resolvePointsForGeneration({
        featureCode: 'castdev_transcription',
        metadata,
      }),
    ]);
    const generation = await prisma.aIGeneration.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        billingPeriodId: access.billingPeriod.id,
        featureCode: 'castdev_transcription',
        featureGroup: pricing.featureGroup,
        generationClass: pricing.generationClass,
        provider: 'OPENAI',
        model: transcriptionModel(input.modelId),
        status: 'RUNNING',
        aiPointsReserved: points,
        metadata,
        startedAt: input.startedAt,
      },
    });
    try {
      await aiPointLedgerService.reserve({
        userId: input.userId,
        projectId: input.projectId,
        billingPeriodId: access.billingPeriod.id,
        generationId: generation.id,
        actionKey: 'castdev_transcription',
        points,
        idempotencyKey: `castdev:${input.recordId}`,
        metadata,
      });
      await prisma.aIUsageEvent.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          generationId: generation.id,
          eventType: 'STARTED',
          featureCode: 'castdev_transcription',
          provider: 'OPENAI',
          model: transcriptionModel(input.modelId),
          metadata,
          createdAt: input.startedAt,
        },
      });
      return { generationId: generation.id, billingPeriodId: access.billingPeriod.id };
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
  },

  async recordTranscriptionSuccess(input: {
    userId: string;
    projectId: string;
    recordId: string;
    durationSec: number | null;
    transcriptChars: number;
    chunksCount: number;
    fileName: string;
    mimeType: string;
    startedAt: Date;
    reservedGenerationId?: string | null;
    modelAlias?: string;
    modelId?: string;
  }): Promise<{ generationId: string; aiPointsCharged: number; aiBalanceRemaining: number }> {
    const metadata = transcriptionMetadata(input);
    const [pricing, access] = await Promise.all([
      featurePricingService.resolve('castdev_transcription'),
      input.reservedGenerationId
        ? accessPolicyService.getUserAccess(input.userId)
        : accessPolicyService.assertCanUseFeature({
          userId: input.userId,
          projectId: input.projectId,
          featureCode: 'castdev_transcription',
          metadata,
        }),
    ]);
    const finishedAt = new Date();
    const model = transcriptionModel(input.modelId);

    const generation = input.reservedGenerationId
      ? await prisma.aIGeneration.findFirstOrThrow({
        where: {
          id: input.reservedGenerationId,
          userId: input.userId,
          projectId: input.projectId,
          status: 'RUNNING',
        },
      })
      : await prisma.aIGeneration.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        billingPeriodId: access.billingPeriod.id,
        featureCode: 'castdev_transcription',
        featureGroup: pricing.featureGroup,
        generationClass: pricing.generationClass,
        provider: 'OPENAI',
        model,
        status: 'SUCCEEDED',
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 0,
        actualCostUsd: new Prisma.Decimal(0),
        creditsCharged: 0,
        latencyMs: finishedAt.getTime() - input.startedAt.getTime(),
        metadata,
        startedAt: input.startedAt,
        finishedAt,
      },
    });
    await providerCallAccountingService.attachCorrelationToGeneration(`castdev:${input.recordId}`, generation.id);
    const providerAggregate = await providerCallAccountingService.aggregateForGeneration(generation.id);

    const aiPointsV2 = Boolean(input.reservedGenerationId);
    if (aiPointsV2) {
      const usage = providerAggregate?.usage ?? { inputTokens: 0, outputTokens: 0 };
      const totalTokens = usage.inputTokens
        + usage.outputTokens
        + (usage.audioInputTokens ?? 0)
        + (usage.audioOutputTokens ?? 0);
      const capture = await aiPointLedgerService.captureWithPersistence({
        userId: input.userId,
        projectId: input.projectId,
        billingPeriodId: access.billingPeriod.id,
        generationId: generation.id,
        actionKey: 'castdev_transcription',
        metadata,
      }, async (tx, capturedPoints) => {
        await tx.aIGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'SUCCEEDED',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens ?? 0,
            reasoningTokens: usage.reasoningTokens ?? 0,
            audioInputTokens: usage.audioInputTokens ?? 0,
            audioOutputTokens: usage.audioOutputTokens ?? 0,
            totalTokens,
            actualCostUsd: providerAggregate?.actualCostUsd ?? new Prisma.Decimal(0),
            retryCount: providerAggregate?.retryCount ?? 0,
            pricingSnapshot: providerAggregate?.pricingSnapshot,
            aiPointsCaptured: capturedPoints,
            latencyMs: finishedAt.getTime() - input.startedAt.getTime(),
            metadata,
            finishedAt,
          },
        });
        await tx.billingPeriod.update({
          where: { id: access.billingPeriod.id },
          data: { costTotalUsd: { increment: providerAggregate?.actualCostUsd ?? new Prisma.Decimal(0) } },
        });
        await tx.aIUsageEvent.create({
          data: {
            userId: input.userId,
            projectId: input.projectId,
            generationId: generation.id,
            eventType: 'SUCCEEDED',
            featureCode: 'castdev_transcription',
            provider: 'OPENAI',
            model,
            costUsd: providerAggregate?.actualCostUsd ?? new Prisma.Decimal(0),
            tokensInput: usage.inputTokens,
            tokensOutput: usage.outputTokens,
            metadata: {
              ...metadata as Record<string, unknown>,
              accountingVersion: 'ai-points-v2',
              aiPointsCaptured: capturedPoints,
              providerCallsCount: providerAggregate?.callsCount ?? 0,
            } as Prisma.InputJsonValue,
            createdAt: finishedAt,
          },
        });
      });
      return {
        generationId: generation.id,
        aiPointsCharged: capture.quantity,
        aiBalanceRemaining: capture.availableAfter,
      };
    }

    if (providerAggregate) {
      const usage = providerAggregate.usage;
      const totalTokens = usage.inputTokens
        + usage.outputTokens
        + (usage.audioInputTokens ?? 0)
        + (usage.audioOutputTokens ?? 0);
      await prisma.$transaction([
        prisma.aIGeneration.update({
          where: { id: generation.id },
          data: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens ?? 0,
            reasoningTokens: usage.reasoningTokens ?? 0,
            audioInputTokens: usage.audioInputTokens ?? 0,
            audioOutputTokens: usage.audioOutputTokens ?? 0,
            totalTokens,
            actualCostUsd: providerAggregate.actualCostUsd,
            retryCount: providerAggregate.retryCount,
            pricingSnapshot: providerAggregate.pricingSnapshot,
          },
        }),
        prisma.billingPeriod.update({
          where: { id: access.billingPeriod.id },
          data: { costTotalUsd: { increment: providerAggregate.actualCostUsd } },
        }),
      ]);
    }

    await prisma.aIUsageEvent.createMany({
      data: [
        {
          userId: input.userId,
          projectId: input.projectId,
          generationId: generation.id,
          eventType: 'STARTED',
          featureCode: 'castdev_transcription',
          provider: 'OPENAI',
          model,
          metadata,
          createdAt: input.startedAt,
        },
        {
          userId: input.userId,
          projectId: input.projectId,
          generationId: generation.id,
          eventType: 'SUCCEEDED',
          featureCode: 'castdev_transcription',
          provider: 'OPENAI',
          model,
          costUsd: providerAggregate?.actualCostUsd ?? new Prisma.Decimal(0),
          tokensInput: providerAggregate?.usage.inputTokens ?? 0,
          tokensOutput: providerAggregate?.usage.outputTokens ?? 0,
          metadata: {
            ...metadata as Record<string, unknown>,
            cachedInputTokens: providerAggregate?.usage.cachedInputTokens ?? 0,
            reasoningTokens: providerAggregate?.usage.reasoningTokens ?? 0,
            audioInputTokens: providerAggregate?.usage.audioInputTokens ?? 0,
            audioOutputTokens: providerAggregate?.usage.audioOutputTokens ?? 0,
            providerCallsCount: providerAggregate?.callsCount ?? 0,
          } as Prisma.InputJsonValue,
          createdAt: finishedAt,
        },
      ],
    });

    const charge = await aiBalanceService.chargeAiBalance({
      userId: input.userId,
      billingPeriodId: access.billingPeriod.id,
      total: access.limits.monthlyCredits,
      featureCode: 'castdev_transcription',
      metadata,
    });

    return {
      generationId: generation.id,
      aiPointsCharged: charge.aiPointsCharged,
      aiBalanceRemaining: charge.aiBalanceRemaining,
    };
  },

  async recordTranscriptionFailure(input: {
    userId: string;
    projectId: string;
    generationId: string;
    error: unknown;
  }): Promise<void> {
    const generation = await prisma.aIGeneration.findFirst({
      where: { id: input.generationId, userId: input.userId, projectId: input.projectId },
    });
    if (!generation || !generation.billingPeriodId) return;
    const message = input.error instanceof Error ? input.error.message : 'Transcription failed';
    await prisma.$transaction([
      prisma.aIGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        },
      }),
      prisma.aIUsageEvent.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          generationId: generation.id,
          eventType: 'FAILED',
          featureCode: 'castdev_transcription',
          provider: 'OPENAI',
          model: generation.model,
          metadata: { error: message, accountingVersion: 'ai-points-v2' },
        },
      }),
    ]);
    await aiPointLedgerService.release({
      userId: input.userId,
      projectId: input.projectId,
      billingPeriodId: generation.billingPeriodId,
      generationId: generation.id,
      actionKey: 'castdev_transcription',
      reason: message,
    });
  },
};
