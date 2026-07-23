import { Prisma } from '@prisma/client';
import { getCastDevTranscriptionCost } from '../config/ai-actions';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiBalanceService } from './ai-balance.service';
import { featurePricingService } from './feature-pricing.service';

function transcriptionModel(): string {
  return process.env['OPENAI_TRANSCRIPTION_MODEL'] ?? 'gpt-4o-mini-transcribe';
}

function transcriptionMetadata(input: {
  recordId: string;
  durationSec: number | null;
  transcriptChars?: number;
  chunksCount?: number;
  fileName?: string;
  mimeType?: string;
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
    transcriptionModel: transcriptionModel(),
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
  }): Promise<{ generationId: string; aiPointsCharged: number; aiBalanceRemaining: number }> {
    const metadata = transcriptionMetadata(input);
    const [pricing, access] = await Promise.all([
      featurePricingService.resolve('castdev_transcription'),
      accessPolicyService.assertCanUseFeature({
        userId: input.userId,
        projectId: input.projectId,
        featureCode: 'castdev_transcription',
        metadata,
      }),
    ]);
    const finishedAt = new Date();
    const model = transcriptionModel();

    const generation = await prisma.aIGeneration.create({
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
          metadata,
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
};
