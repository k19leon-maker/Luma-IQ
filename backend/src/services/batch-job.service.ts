import { AIGenerationStatus, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { type AIActionKey } from '../config/ai-action-registry';
import { env } from '../config/env';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';
import { prisma } from '../lib/prisma';
import { promptRegistry } from '../prompts/registry';
import {
  openAIBatchProvider,
  type OpenAIBatchRequest,
  type OpenAIBatchResult,
} from '../providers/openai-batch.provider';
import { openAIProvider } from '../providers/openai.provider';
import { accessPolicyService } from './access-policy.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiActionResolverService } from './ai-action-resolver.service';
import { aiCostService } from './ai-cost.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiPointLedgerService } from './ai-point-ledger.service';
import { featurePricingService } from './feature-pricing.service';
import { modelRegistryService } from './model-registry.service';
import { projectContextService } from './project-context.service';
import { promptCmsService } from './prompt-cms.service';
import { structuredOutputService } from './structured-output.service';

export type BatchJobPublicStatus =
  | 'queued'
  | 'submitted'
  | 'in_progress'
  | 'finalizing'
  | 'completed'
  | 'partially_failed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type BatchWorkflowItemInput = {
  customId?: string;
  title?: string;
  inputs: Record<string, unknown>;
};

type BatchUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
};

const activeJobs = new Set<string>();
let pollTimer: NodeJS.Timeout | null = null;

const TERMINAL_STATUSES = new Set<BatchJobPublicStatus>([
  'completed',
  'partially_failed',
  'failed',
  'cancelled',
  'expired',
]);

function error(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function safeCustomId(value: string, position: number): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
  return normalized || `item-${position + 1}`;
}

function generationIdempotencyKey(jobKey: string, customId: string): string {
  return `batch-item:${crypto.createHash('sha256').update(`${jobKey}:${customId}`).digest('hex')}`;
}

function usageFromResult(result: OpenAIBatchResult): BatchUsage {
  const usage = result.response?.body?.usage ?? {};
  return {
    inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    cachedInputTokens: Number(
      (usage.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens
      ?? (usage.input_tokens_details as Record<string, unknown> | undefined)?.cached_tokens
      ?? 0,
    ),
    reasoningTokens: Number(
      (usage.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens
      ?? (usage.output_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens
      ?? 0,
    ),
  };
}

export function mapProviderBatchStatus(status: string): BatchJobPublicStatus {
  if (status === 'in_progress') return 'in_progress';
  if (status === 'finalizing' || status === 'cancelling') return 'finalizing';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired') return 'expired';
  return 'submitted';
}

export function deriveSettledBatchStatus(input: {
  providerStatus: string;
  completed: number;
  failed: number;
  total: number;
}): BatchJobPublicStatus {
  if (input.providerStatus === 'cancelled') return 'cancelled';
  if (input.providerStatus === 'expired') return 'expired';
  if (input.completed === input.total) return 'completed';
  if (input.completed > 0 && input.failed > 0) return 'partially_failed';
  if (input.failed >= input.total) return 'failed';
  return mapProviderBatchStatus(input.providerStatus);
}

export function assertBatchEligible(actionKey: AIActionKey, batchEligible: boolean, itemCount: number): void {
  if (itemCount < 2) {
    throw error(400, 'BATCH_REQUIRES_PACKAGE', 'Фоновый режим доступен для пакета минимум из двух материалов.');
  }
  if (!batchEligible) {
    throw error(400, 'ACTION_NOT_BATCH_ELIGIBLE', 'Это действие нужно запускать в режиме «Сейчас».');
  }
  if (
    actionKey.startsWith('ai_chat')
    || actionKey.startsWith('product_')
    || actionKey.startsWith('lead_magnet')
  ) {
    throw error(400, 'INTERACTIVE_ACTION_NOT_BATCH_ELIGIBLE', 'Диалог и пошаговые конструкторы нельзя запускать фоном.');
  }
}

function publicJob<T extends {
  id: string;
  status: string;
  actionKey: string;
  workflow: string;
  step: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  items?: Array<{
    id: string;
    customId: string;
    position: number;
    status: string;
    output: Prisma.JsonValue | null;
    error: Prisma.JsonValue | null;
    aiPoints: number;
    artifactId: string | null;
  }>;
}>(job: T) {
  return {
    id: job.id,
    status: job.status,
    actionKey: job.actionKey,
    workflow: job.workflow,
    step: job.step,
    totalItems: job.totalItems,
    completedItems: job.completedItems,
    failedItems: job.failedItems,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    items: job.items?.map((item) => ({
      id: item.id,
      customId: item.customId,
      position: item.position,
      status: item.status,
      output: item.output,
      error: item.error,
      aiPoints: item.aiPoints,
      artifactId: item.artifactId,
    })),
  };
}

async function releaseItem(item: {
  id: string;
  generationId: string | null;
  batchJob: {
    userId: string;
    projectId: string;
    actionKey: string;
  };
}, reason: string, details?: Prisma.InputJsonValue): Promise<void> {
  if (!item.generationId) return;
  const generation = await prisma.aIGeneration.findUnique({ where: { id: item.generationId } });
  if (!generation?.billingPeriodId || generation.status === 'SUCCEEDED') return;
  await aiPointLedgerService.release({
    userId: item.batchJob.userId,
    projectId: item.batchJob.projectId,
    billingPeriodId: generation.billingPeriodId,
    generationId: generation.id,
    actionKey: item.batchJob.actionKey,
    reason,
    metadata: details,
  }).catch(() => undefined);
  await prisma.$transaction([
    prisma.aIGeneration.update({
      where: { id: generation.id },
      data: {
        status: AIGenerationStatus.FAILED,
        errorCode: 'BATCH_ITEM_FAILED',
        errorMessage: reason,
        finishedAt: new Date(),
      },
    }),
    prisma.aIUsageEvent.create({
      data: {
        userId: item.batchJob.userId,
        projectId: item.batchJob.projectId,
        generationId: generation.id,
        eventType: 'FAILED',
        featureCode: generation.featureCode,
        provider: generation.provider,
        model: generation.model,
        metadata: { batch: true, reason },
      },
    }),
    prisma.aIBatchItem.update({
      where: { id: item.id },
      data: {
        status: 'failed',
        error: (details ?? { message: reason }) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    }),
  ]);
}

async function settleSuccess(
  item: Awaited<ReturnType<typeof prisma.aIBatchItem.findFirst>> & {
    batchJob: {
      userId: string;
      projectId: string;
      actionKey: string;
      workflow: string;
      step: string;
      metadata: Prisma.JsonValue | null;
    };
  },
  result: OpenAIBatchResult,
): Promise<void> {
  if (!item?.generationId || item.status === 'completed') return;
  const content = String(result.response?.body?.choices?.[0]?.message?.content ?? '').trim();
  if (!content || Number(result.response?.status_code ?? 500) >= 400 || result.error) {
    await releaseItem(item, 'Пакетная генерация элемента завершилась с ошибкой', {
      providerError: result.error ?? null,
      statusCode: result.response?.status_code ?? null,
    } as Prisma.InputJsonValue);
    return;
  }
  const generation = await prisma.aIGeneration.findUnique({ where: { id: item.generationId } });
  if (!generation?.billingPeriodId) return;
  const usage = usageFromResult(result);
  const cost = await aiCostService.calculate({
    provider: 'OPENAI',
    model: generation.model,
    usage,
    discountMultiplier: 0.5,
  });
  const rawInputs = item.input && typeof item.input === 'object' && !Array.isArray(item.input)
    ? item.input as Record<string, unknown>
    : {};
  const title = String(rawInputs.title ?? rawInputs.topic ?? item.customId);
  const structured = structuredOutputService.build({
    userId: item.batchJob.userId,
    projectId: item.batchJob.projectId,
    artifactId: 'pending',
    workflow: item.batchJob.workflow,
    step: item.batchJob.step,
    type: String((item.batchJob.metadata as Record<string, unknown> | null)?.artifactType ?? 'batch_content'),
    title,
    content,
    inputs: rawInputs,
    metadata: { batchJobId: item.batchJobId, customId: item.customId },
  });
  const totalTokens = usage.inputTokens + usage.outputTokens;

  await aiPointLedgerService.captureWithPersistence({
    userId: item.batchJob.userId,
    projectId: item.batchJob.projectId,
    billingPeriodId: generation.billingPeriodId,
    generationId: generation.id,
    actionKey: item.batchJob.actionKey,
    metadata: { batchJobId: item.batchJobId, customId: item.customId },
  }, async (tx, capturedPoints) => {
    const artifact = await tx.aIArtifact.create({
      data: {
        type: structured.kind,
        workflow: item.batchJob.workflow,
        step: item.batchJob.step,
        projectId: item.batchJob.projectId,
        userId: item.batchJob.userId,
        generationId: generation.id,
        title,
        content,
        structured: structured.data as Prisma.InputJsonValue,
        metadata: { batchJobId: item.batchJobId, customId: item.customId, mode: 'background' },
      },
    });
    await tx.projectStructuredOutput.create({
      data: {
        userId: item.batchJob.userId,
        projectId: item.batchJob.projectId,
        artifactId: artifact.id,
        domain: structured.domain,
        kind: structured.kind,
        key: structured.key,
        title: structured.title ?? null,
        content,
        data: structured.data as Prisma.InputJsonValue,
        source: 'ai_artifact',
      },
    });
    await tx.aIGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'SUCCEEDED',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens,
        actualCostUsd: cost.actualCostUsd,
        aiPointsCaptured: capturedPoints,
        pricingSnapshot: cost.pricingSnapshot,
        finishedAt: new Date(),
      },
    });
    await tx.aIProviderCall.create({
      data: {
        generationId: generation.id,
        userId: item.batchJob.userId,
        projectId: item.batchJob.projectId,
        correlationId: item.batchJobId,
        responseId: result.response?.body?.id ?? result.id ?? null,
        provider: 'OPENAI',
        modelAlias: 'LUNA',
        actualModelId: generation.model,
        actionKey: item.batchJob.actionKey,
        pipeline: 'batch',
        stage: 'item',
        status: 'SUCCEEDED',
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        isBatch: true,
        costUsd: cost.actualCostUsd,
        pricingSnapshot: cost.pricingSnapshot,
        metadata: { batchJobId: item.batchJobId, customId: item.customId, discountMultiplier: 0.5 },
        finishedAt: new Date(),
      },
    });
    await tx.billingPeriod.update({
      where: { id: generation.billingPeriodId! },
      data: { costTotalUsd: { increment: cost.actualCostUsd } },
    });
    await tx.aIUsageEvent.create({
      data: {
        userId: item.batchJob.userId,
        projectId: item.batchJob.projectId,
        generationId: generation.id,
        eventType: 'SUCCEEDED',
        featureCode: generation.featureCode,
        provider: 'OPENAI',
        model: generation.model,
        costUsd: cost.actualCostUsd,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
        metadata: {
          accountingVersion: 'ai-points-v2',
          mode: 'background',
          batchJobId: item.batchJobId,
          aiPointsCaptured: capturedPoints,
          discountMultiplier: 0.5,
        },
      },
    });
    await tx.aIBatchItem.update({
      where: { id: item.id },
      data: {
        status: 'completed',
        output: { content } as Prisma.InputJsonValue,
        artifactId: artifact.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        costUsd: cost.actualCostUsd,
        completedAt: new Date(),
      },
    });
  });
}

async function settleTerminal(jobId: string, providerStatus: string, outputFileId: string | null, errorFileId: string | null) {
  const job = await prisma.aIBatchJob.findUnique({
    where: { id: jobId },
    include: { items: true },
  });
  if (!job) return;
  const results: OpenAIBatchResult[] = [];
  if (outputFileId) {
    results.push(...await openAIBatchProvider.downloadResults({ apiKey: env.OPENAI_API_KEY, fileId: outputFileId }));
  }
  if (errorFileId) {
    results.push(...await openAIBatchProvider.downloadResults({ apiKey: env.OPENAI_API_KEY, fileId: errorFileId }));
  }
  const byCustomId = new Map(results.map((result) => [result.custom_id, result]));
  for (const rawItem of job.items) {
    if (rawItem.status === 'completed' || rawItem.status === 'failed') continue;
    const item = await prisma.aIBatchItem.findFirst({
      where: { id: rawItem.id },
      include: { batchJob: true },
    });
    if (!item) continue;
    const result = byCustomId.get(item.customId);
    if (result) {
      await settleSuccess(item, result);
    } else {
      await releaseItem(
        item,
        providerStatus === 'cancelled'
          ? 'Пакет отменен пользователем'
          : providerStatus === 'expired'
            ? 'Срок выполнения пакета истек'
            : 'Провайдер не вернул результат элемента',
        { providerStatus },
      );
    }
  }
  const counts = await prisma.aIBatchItem.groupBy({
    by: ['status'],
    where: { batchJobId: job.id },
    _count: true,
  });
  const completed = counts.find((row) => row.status === 'completed')?._count ?? 0;
  const failed = counts.find((row) => row.status === 'failed')?._count ?? 0;
  const status = deriveSettledBatchStatus({ providerStatus, completed, failed, total: job.totalItems });
  const now = new Date();
  await prisma.$transaction([
    prisma.aIBatchJob.update({
      where: { id: job.id },
      data: {
        status,
        completedItems: completed,
        failedItems: failed,
        outputFileId,
        errorFileId,
        completedAt: status === 'completed' || status === 'partially_failed' || status === 'failed' ? now : undefined,
        cancelledAt: status === 'cancelled' ? now : undefined,
        expiredAt: status === 'expired' ? now : undefined,
      },
    }),
    ...(job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
      && typeof (job.metadata as Record<string, unknown>).workflowRunId === 'string'
      ? [prisma.aIWorkflowRun.updateMany({
        where: { id: String((job.metadata as Record<string, unknown>).workflowRunId) },
        data: {
          status: status === 'completed' ? 'SUCCEEDED' : status === 'partially_failed' ? 'PARTIALLY_FAILED' : status.toUpperCase(),
          completedAt: now,
        },
      })]
      : []),
  ]);
}

async function submitJob(jobId: string): Promise<void> {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  try {
    const job = await prisma.aIBatchJob.findUnique({ where: { id: jobId }, include: { items: true } });
    if (!job || TERMINAL_STATUSES.has(job.status as BatchJobPublicStatus) || job.providerBatchId) return;
    const config = promptRegistry.get(job.workflow, job.step);
    const definition = await aiActionRegistryService.resolve(job.actionKey as AIActionKey);
    const [terra, luna] = await Promise.all([
      modelRegistryService.resolve('TERRA'),
      modelRegistryService.resolve('LUNA'),
    ]);
    if (terra.provider !== 'OPENAI' || luna.provider !== 'OPENAI') {
      throw error(503, 'BATCH_PROVIDER_UNAVAILABLE', 'Фоновый режим временно недоступен для настроенных моделей.');
    }
    const firstInput = job.items[0]?.input as Record<string, unknown>;
    const sharedContext = await projectContextService.build({
      userId: job.userId,
      projectId: job.projectId,
      workflow: job.workflow,
      step: job.step,
      inputs: firstInput,
      tokenBudget: definition.contextBudget,
    });
    const concept = await openAIProvider.chatCompletion({
      apiKey: env.OPENAI_API_KEY,
      model: terra.actualModelId,
      messages: [
        {
          role: 'system',
          content: 'Ты стратег контентных серий Luma IQ. Сформируй единый компактный замысел серии без написания отдельных материалов.',
        },
        {
          role: 'user',
          content: [
            `Workflow: ${job.workflow}.${job.step}`,
            `Количество материалов: ${job.totalItems}`,
            'Контекст проекта:',
            sharedContext.rendered,
            'Темы и входные данные:',
            job.items.map((item) => stableJson(item.input)).join('\n'),
            'Верни кратко: общая цель, логика последовательности, тональность, ограничения и различия между материалами.',
          ].join('\n\n'),
        },
      ],
      maxTokens: Math.min(2500, definition.outputLimit),
      temperature: 0.4,
      telemetry: {
        userId: job.userId,
        projectId: job.projectId,
        correlationId: job.id,
        actionKey: job.actionKey,
        pipeline: 'batch',
        stage: 'shared_concept',
        modelAlias: 'TERRA',
        isBatch: false,
        metadata: { batchJobId: job.id, totalItems: job.totalItems },
      },
    });
    const requests: OpenAIBatchRequest[] = [];
    for (const item of job.items) {
      const inputs = item.input as Record<string, unknown>;
      const context = await projectContextService.build({
        userId: job.userId,
        projectId: job.projectId,
        workflow: job.workflow,
        step: job.step,
        inputs,
        tokenBudget: definition.contextBudget,
      });
      const effective = await promptCmsService.resolve({
        config,
        userId: job.userId,
        projectId: job.projectId,
        context,
        inputs,
        baseSystemPrompt: withGlobalAiBehaviorPrompt(config.systemPrompt(context)),
        baseUserPrompt: config.userPromptBuilder({ inputs, context }),
      });
      const body: Record<string, unknown> = {
        model: luna.actualModelId,
        messages: [
          { role: 'system', content: effective.systemPrompt },
          {
            role: 'user',
            content: [
              effective.userPrompt,
              '',
              'Общий замысел серии:',
              concept.result.content,
              '',
              'Создай только текущий материал. Не повторяй другие элементы серии.',
            ].join('\n'),
          },
        ],
      };
      if (luna.actualModelId.startsWith('gpt-5')) {
        body.max_completion_tokens = Math.min(effective.maxTokens, definition.outputLimit);
      } else {
        body.max_tokens = Math.min(effective.maxTokens, definition.outputLimit);
        body.temperature = effective.temperature;
      }
      requests.push({
        custom_id: item.customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body,
      });
    }
    const submitted = await openAIBatchProvider.submit({
      apiKey: env.OPENAI_API_KEY,
      requests,
      idempotencyKey: job.idempotencyKey,
      metadata: {
        lumaiq_batch_job_id: job.id,
        action_key: job.actionKey,
        project_id: job.projectId,
      },
    });
    await prisma.aIBatchJob.update({
      where: { id: job.id },
      data: {
        status: mapProviderBatchStatus(submitted.status),
        providerBatchId: submitted.batchId,
        inputFileId: submitted.inputFileId,
        submittedAt: new Date(),
        metadata: {
          ...((job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata))
            ? job.metadata as Record<string, unknown>
            : {}),
          terraModel: terra.actualModelId,
          lunaModel: luna.actualModelId,
          conceptProviderCallId: concept.providerCallId,
        } as Prisma.InputJsonValue,
      },
    });
    if (
      job.metadata
      && typeof job.metadata === 'object'
      && !Array.isArray(job.metadata)
      && typeof (job.metadata as Record<string, unknown>).workflowRunId === 'string'
    ) {
      await prisma.aIWorkflowRun.updateMany({
        where: { id: String((job.metadata as Record<string, unknown>).workflowRunId), status: 'QUEUED' },
        data: { status: 'RUNNING' },
      });
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Не удалось отправить пакет';
    const items = await prisma.aIBatchItem.findMany({ where: { batchJobId: jobId }, include: { batchJob: true } });
    for (const item of items) await releaseItem(item, message);
    await prisma.aIBatchJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: message, failedItems: items.length, completedAt: new Date() },
    }).catch(() => undefined);
  } finally {
    activeJobs.delete(jobId);
  }
}

async function refreshJob(jobId: string): Promise<void> {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  try {
    const job = await prisma.aIBatchJob.findUnique({ where: { id: jobId } });
    if (!job || TERMINAL_STATUSES.has(job.status as BatchJobPublicStatus)) return;
    if (!job.providerBatchId) {
      activeJobs.delete(jobId);
      await submitJob(jobId);
      return;
    }
    const provider = await openAIBatchProvider.retrieve({
      apiKey: env.OPENAI_API_KEY,
      batchId: job.providerBatchId,
    });
    const mapped = mapProviderBatchStatus(provider.status);
    await prisma.aIBatchJob.update({
      where: { id: job.id },
      data: {
        status: mapped,
        outputFileId: provider.outputFileId,
        errorFileId: provider.errorFileId,
        inProgressAt: mapped === 'in_progress' ? job.inProgressAt ?? new Date() : undefined,
        finalizingAt: mapped === 'finalizing' ? job.finalizingAt ?? new Date() : undefined,
        errorMessage: provider.status === 'failed' ? stableJson(provider.errors) : null,
      },
    });
    if (['completed', 'failed', 'cancelled', 'expired'].includes(provider.status)) {
      await settleTerminal(job.id, provider.status, provider.outputFileId, provider.errorFileId);
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

async function pollPendingJobs(): Promise<void> {
  const jobs = await prisma.aIBatchJob.findMany({
    where: { status: { in: ['queued', 'submitted', 'in_progress', 'finalizing'] } },
    orderBy: { updatedAt: 'asc' },
    take: 20,
    select: { id: true },
  });
  for (const job of jobs) await refreshJob(job.id).catch((cause) => {
    console.error(`[BatchJob] refresh ${job.id} failed:`, cause);
  });
}

export const batchJobService = {
  async create(input: {
    userId: string;
    projectId: string;
    workflow: string;
    step: string;
    items: BatchWorkflowItemInput[];
    idempotencyKey: string;
  }) {
    if (!(await aiFeatureFlagsService.isEnabled('AI_BATCH_ENABLED'))) {
      throw error(503, 'AI_BATCH_DISABLED', 'Фоновый режим пока отключен.');
    }
    if (!(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) {
      throw error(503, 'AI_POINTS_V2_REQUIRED', 'Фоновый режим требует нового AI-баланса.');
    }
    if (!env.OPENAI_API_KEY) throw error(503, 'OPENAI_NOT_CONFIGURED', 'AI-провайдер не настроен.');
    if (input.items.length > 100) throw error(400, 'BATCH_TOO_LARGE', 'За один раз можно запустить не более 100 материалов.');
    const existing = await prisma.aIBatchJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (existing) {
      if (existing.userId !== input.userId) throw error(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Ключ запроса уже использован.');
      return publicJob(existing);
    }
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true },
    });
    if (!project) throw error(404, 'PROJECT_NOT_FOUND', 'Проект не найден.');
    const config = promptRegistry.get(input.workflow, input.step);
    const actionKeys = input.items.map((item) => aiActionResolverService.resolve({
      featureCode: config.feature,
      workflow: input.workflow,
      step: input.step,
      inputs: item.inputs,
    }));
    const actionKey = actionKeys[0];
    if (!actionKey || actionKeys.some((candidate) => candidate !== actionKey)) {
      throw error(400, 'MIXED_BATCH_ACTIONS', 'Все элементы пакета должны относиться к одному AI-действию.');
    }
    const definition = await aiActionRegistryService.resolve(actionKey);
    assertBatchEligible(actionKey, definition.batchEligible, input.items.length);
    const luna = await modelRegistryService.resolve('LUNA');
    if (luna.provider !== 'OPENAI') throw error(503, 'BATCH_PROVIDER_UNAVAILABLE', 'Фоновый режим временно недоступен.');
    await aiCostService.assertPricingExists({ provider: 'OPENAI', model: luna.actualModelId });
    const pricing = await featurePricingService.resolve(config.feature);
    const access = await accessPolicyService.assertCanUseFeature({
      userId: input.userId,
      projectId: input.projectId,
      featureCode: config.feature,
      estimatedCredits: pricing.creditPrice,
      metadata: { actionKey, mode: 'background', itemCount: input.items.length },
    });
    const normalizedItems = input.items.map((item, position) => ({
      customId: safeCustomId(item.customId ?? `item-${position + 1}`, position),
      title: item.title,
      inputs: item.inputs,
      position,
    }));
    if (new Set(normalizedItems.map((item) => item.customId)).size !== normalizedItems.length) {
      throw error(400, 'DUPLICATE_CUSTOM_ID', 'Идентификаторы элементов пакета должны быть уникальными.');
    }
    const run = await prisma.aIWorkflowRun.create({
      data: {
        workflow: `${input.workflow}.batch`,
        featureCode: config.feature,
        projectId: input.projectId,
        userId: input.userId,
        status: 'QUEUED',
        input: { itemCount: input.items.length, mode: 'background' },
        metadata: { actionKey },
      },
    });
    const job = await prisma.aIBatchJob.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        actionKey,
        featureCode: config.feature,
        workflow: input.workflow,
        step: input.step,
        status: 'queued',
        idempotencyKey: input.idempotencyKey,
        totalItems: normalizedItems.length,
        metadata: {
          workflowRunId: run.id,
          artifactType: config.artifactType,
          promptVersion: config.version,
          definitionVersionId: definition.definitionVersionId,
          pricingVersionId: definition.pricingVersionId,
        },
        items: {
          create: normalizedItems.map((item) => ({
            customId: item.customId,
            position: item.position,
            input: { ...item.inputs, title: item.title } as Prisma.InputJsonValue,
            aiPoints: definition.aiPoints,
          })),
        },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    try {
      for (const item of job.items) {
        const generation = await prisma.aIGeneration.create({
          data: {
            userId: input.userId,
            projectId: input.projectId,
            billingPeriodId: access.billingPeriod.id,
            workflowRunId: run.id,
            featureCode: config.feature,
            featureGroup: pricing.featureGroup,
            generationClass: pricing.generationClass,
            provider: 'OPENAI',
            model: luna.actualModelId,
            status: 'RUNNING',
            idempotencyKey: generationIdempotencyKey(input.idempotencyKey, item.customId),
            aiPointsReserved: definition.aiPoints,
            promptVersion: config.version,
            contextVersion: 'project-context-v2',
            metadata: {
              actionKey,
              mode: 'background',
              batchJobId: job.id,
              batchItemId: item.id,
              customId: item.customId,
            },
            startedAt: new Date(),
          },
        });
        try {
          await aiPointLedgerService.reserve({
            userId: input.userId,
            projectId: input.projectId,
            billingPeriodId: access.billingPeriod.id,
            generationId: generation.id,
            actionKey,
            points: definition.aiPoints,
            idempotencyKey: generation.idempotencyKey,
            metadata: { batchJobId: job.id, batchItemId: item.id },
          });
        } catch (cause) {
          await prisma.aIGeneration.update({
            where: { id: generation.id },
            data: {
              status: 'FAILED',
              errorCode: 'BATCH_RESERVE_FAILED',
              errorMessage: cause instanceof Error ? cause.message : 'Reserve failed',
              finishedAt: new Date(),
            },
          });
          throw cause;
        }
        await prisma.$transaction([
          prisma.aIBatchItem.update({
            where: { id: item.id },
            data: { generationId: generation.id, status: 'reserved' },
          }),
          prisma.aIUsageEvent.create({
            data: {
              userId: input.userId,
              projectId: input.projectId,
              generationId: generation.id,
              eventType: 'STARTED',
              featureCode: config.feature,
              provider: 'OPENAI',
              model: luna.actualModelId,
              metadata: { batchJobId: job.id, mode: 'background' },
            },
          }),
        ]);
      }
    } catch (cause) {
      const reserved = await prisma.aIBatchItem.findMany({
        where: { batchJobId: job.id },
        include: { batchJob: true },
      });
      for (const item of reserved) await releaseItem(item, 'Не удалось зарезервировать баланс для всего пакета');
      await prisma.aIBatchJob.update({
        where: { id: job.id },
        data: { status: 'failed', failedItems: job.totalItems, errorMessage: cause instanceof Error ? cause.message : 'Reserve failed' },
      });
      throw cause;
    }
    void submitJob(job.id);
    return publicJob(await prisma.aIBatchJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { items: { orderBy: { position: 'asc' } } },
    }));
  },

  async list(userId: string, projectId?: string) {
    const jobs = await prisma.aIBatchJob.findMany({
      where: { userId, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return jobs.map(publicJob);
  },

  async get(userId: string, id: string) {
    const job = await prisma.aIBatchJob.findFirst({
      where: { id, userId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!job) throw error(404, 'BATCH_JOB_NOT_FOUND', 'Пакетное задание не найдено.');
    return publicJob(job);
  },

  async refresh(userId: string, id: string) {
    const job = await prisma.aIBatchJob.findFirst({ where: { id, userId }, select: { id: true } });
    if (!job) throw error(404, 'BATCH_JOB_NOT_FOUND', 'Пакетное задание не найдено.');
    await refreshJob(job.id);
    return batchJobService.get(userId, id);
  },

  async cancel(userId: string, id: string) {
    const job = await prisma.aIBatchJob.findFirst({ where: { id, userId } });
    if (!job) throw error(404, 'BATCH_JOB_NOT_FOUND', 'Пакетное задание не найдено.');
    if (TERMINAL_STATUSES.has(job.status as BatchJobPublicStatus)) return batchJobService.get(userId, id);
    if (job.providerBatchId) {
      await openAIBatchProvider.cancel({ apiKey: env.OPENAI_API_KEY, batchId: job.providerBatchId });
      await prisma.aIBatchJob.update({ where: { id }, data: { status: 'finalizing', finalizingAt: new Date() } });
    } else {
      const items = await prisma.aIBatchItem.findMany({ where: { batchJobId: id }, include: { batchJob: true } });
      for (const item of items) await releaseItem(item, 'Пакет отменен пользователем');
      await prisma.aIBatchJob.update({
        where: { id },
        data: { status: 'cancelled', failedItems: items.length, cancelledAt: new Date() },
      });
    }
    return batchJobService.get(userId, id);
  },

  async recoverPending(): Promise<number> {
    const count = await prisma.aIBatchJob.count({
      where: { status: { in: ['queued', 'submitted', 'in_progress', 'finalizing'] } },
    });
    await pollPendingJobs();
    return count;
  },

  startPolling(intervalMs = 30_000): void {
    if (pollTimer) return;
    pollTimer = setInterval(() => void pollPendingJobs(), intervalMs);
    pollTimer.unref();
  },
};
