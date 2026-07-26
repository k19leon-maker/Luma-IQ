import { AIProvider, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type {
  MeteredProviderResult,
  ProviderExecutionResult,
  ProviderTelemetryContext,
} from '../providers/provider.types';
import { aiCostService, TokenUsage } from './ai-cost.service';

function errorDetails(error: unknown): { code: string | null; message: string } {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; status?: unknown; message?: unknown };
    return {
      code: typeof value.code === 'string'
        ? value.code
        : typeof value.status === 'number' ? String(value.status) : null,
      message: typeof value.message === 'string' ? value.message : 'Provider request failed',
    };
  }
  return { code: null, message: String(error || 'Provider request failed') };
}

function zeroPricingSnapshot(provider: AIProvider, model: string, reason: string): Prisma.InputJsonValue {
  return { provider, model, missingPricing: true, reason };
}

async function safeCost(provider: AIProvider, model: string, usage: TokenUsage) {
  try {
    return await aiCostService.calculate({ provider, model, usage });
  } catch (error) {
    console.error('[ProviderAccounting] cost calculation failed:', error);
    return {
      actualCostUsd: new Prisma.Decimal(0),
      pricingSnapshot: zeroPricingSnapshot(provider, model, 'pricing_lookup_failed'),
    };
  }
}

export const providerCallAccountingService = {
  async execute<T>(input: {
    provider: AIProvider;
    model: string;
    telemetry: ProviderTelemetryContext;
    execute: () => Promise<ProviderExecutionResult<T>>;
  }): Promise<MeteredProviderResult<T>> {
    const startedAt = new Date();
    const startedAtMs = Date.now();
    const store = prisma.aIProviderCall;
    const call = store
      ? await store.create({
        data: {
          generationId: input.telemetry.generationId ?? null,
          workflowRunId: input.telemetry.workflowRunId ?? null,
          workflowStepId: input.telemetry.workflowStepId ?? null,
          userId: input.telemetry.userId ?? null,
          projectId: input.telemetry.projectId ?? null,
          correlationId: input.telemetry.correlationId ?? null,
          provider: input.provider,
          modelAlias: input.telemetry.modelAlias ?? null,
          actualModelId: input.model,
          modelSnapshot: input.telemetry.modelSnapshot,
          promptVersion: input.telemetry.promptVersion ?? null,
          actionKey: input.telemetry.actionKey,
          pipeline: input.telemetry.pipeline ?? null,
          stage: input.telemetry.stage,
          retryIndex: input.telemetry.retryIndex ?? 0,
          isBatch: input.telemetry.isBatch ?? false,
          metadata: input.telemetry.metadata,
          startedAt,
        },
        select: { id: true },
      }).catch((error) => {
        console.error('[ProviderAccounting] start record failed:', error);
        return null;
      })
      : null;

    try {
      const executed = await input.execute();
      const cost = await safeCost(input.provider, input.model, executed.usage);
      const finishedAt = new Date();

      if (call && store) {
        await store.update({
          where: { id: call.id },
          data: {
            responseId: executed.responseId ?? null,
            status: 'SUCCEEDED',
            inputTokens: executed.usage.inputTokens,
            cachedInputTokens: executed.usage.cachedInputTokens ?? 0,
            outputTokens: executed.usage.outputTokens,
            reasoningTokens: executed.usage.reasoningTokens ?? 0,
            audioInputTokens: executed.usage.audioInputTokens ?? 0,
            audioOutputTokens: executed.usage.audioOutputTokens ?? 0,
            latencyMs: Date.now() - startedAtMs,
            costUsd: cost.actualCostUsd,
            pricingSnapshot: cost.pricingSnapshot,
            finishedAt,
          },
        }).catch((error) => console.error('[ProviderAccounting] success record failed:', error));
      }

      return {
        ...executed,
        provider: input.provider,
        model: input.model,
        providerCallId: call?.id ?? null,
        actualCostUsd: cost.actualCostUsd.toString(),
        pricingSnapshot: cost.pricingSnapshot,
      };
    } catch (error) {
      const details = errorDetails(error);
      if (call && store) {
        await store.update({
          where: { id: call.id },
          data: {
            status: 'FAILED',
            errorCode: details.code,
            errorMessage: details.message,
            latencyMs: Date.now() - startedAtMs,
            finishedAt: new Date(),
          },
        }).catch((recordError) => console.error('[ProviderAccounting] failure record failed:', recordError));
      }
      throw error;
    }
  },

  async aggregateForGeneration(generationId: string): Promise<{
    usage: TokenUsage;
    actualCostUsd: Prisma.Decimal;
    retryCount: number;
    callsCount: number;
    pricingSnapshot: Prisma.InputJsonValue;
  } | null> {
    const store = prisma.aIProviderCall;
    if (!store) return null;
    const calls = await store.findMany({
      where: { generationId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'asc' },
    }).catch((error) => {
      console.error('[ProviderAccounting] aggregate lookup failed:', error);
      return [];
    });
    if (!calls.length) return null;

    const usage = calls.reduce<TokenUsage>((total, call) => ({
      inputTokens: total.inputTokens + call.inputTokens,
      cachedInputTokens: (total.cachedInputTokens ?? 0) + call.cachedInputTokens,
      outputTokens: total.outputTokens + call.outputTokens,
      reasoningTokens: (total.reasoningTokens ?? 0) + call.reasoningTokens,
      audioInputTokens: (total.audioInputTokens ?? 0) + call.audioInputTokens,
      audioOutputTokens: (total.audioOutputTokens ?? 0) + call.audioOutputTokens,
    }), { inputTokens: 0, outputTokens: 0 });

    return {
      usage,
      actualCostUsd: calls.reduce((total, call) => total.add(call.costUsd), new Prisma.Decimal(0)),
      retryCount: calls.filter((call) => call.retryIndex > 0).length,
      callsCount: calls.length,
      pricingSnapshot: {
        accountingVersion: 'provider-calls-v2',
        calls: calls.map((call) => ({
          id: call.id,
          responseId: call.responseId,
          provider: call.provider,
          modelAlias: call.modelAlias,
          actualModelId: call.actualModelId,
          stage: call.stage,
          retryIndex: call.retryIndex,
          costUsd: call.costUsd.toString(),
          pricing: call.pricingSnapshot,
        })),
      },
    };
  },

  async attachCorrelationToGeneration(correlationId: string, generationId: string): Promise<void> {
    const store = prisma.aIProviderCall;
    if (!store) return;
    await store.updateMany({
      where: { correlationId, generationId: null },
      data: { generationId },
    }).catch((error) => console.error('[ProviderAccounting] correlation attach failed:', error));
  },
};
