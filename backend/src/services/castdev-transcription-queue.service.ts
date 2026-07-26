import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AccessPolicyError } from './access-policy.service';
import { castDevBillingService } from './castdev-billing.service';
import { CastDevTranscriptionError, transcribeCastDevRecord } from './castdev-transcription.service';

type QueueItem = {
  userId: string;
  recordId: string;
  mode: 'mini' | 'diarize';
};

const STALE_TRANSCRIBING_MS = 30 * 60 * 1000;
const MAX_PARALLEL_TRANSCRIPTIONS = 2;
const queue: QueueItem[] = [];
const queuedKeys = new Set<string>();
const activeKeys = new Set<string>();
const activeUsers = new Set<string>();

function queueKey(item: QueueItem): string {
  return `${item.userId}:${item.recordId}`;
}

export function selectNextCastDevQueueIndex(
  items: ReadonlyArray<Pick<QueueItem, 'userId'>>,
  busyUsers: ReadonlySet<string>,
): number {
  return items.findIndex((candidate) => !busyUsers.has(candidate.userId));
}

function recordMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function publicErrorMessage(err: unknown): { message: string; status: number } {
  if (err instanceof CastDevTranscriptionError || err instanceof AccessPolicyError) {
    return { message: err.message, status: err.status };
  }
  return {
    message: 'Не удалось распознать речь в записи. Проверьте качество звука или попробуйте другой файл.',
    status: 500,
  };
}

async function processItem(item: QueueItem): Promise<void> {
  const existing = await prisma.castDevRecord.findFirst({
    where: { id: item.recordId, userId: item.userId },
  });
  if (!existing) return;

  const startedAt = new Date();
  await prisma.castDevRecord.update({
    where: { id: existing.id },
    data: {
      status: 'transcribing',
      errorMessage: null,
      metadata: {
        ...recordMetadata(existing.metadata),
        transcriptionStartedAt: startedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  let reservedGenerationId: string | null = null;
  try {
    const result = await transcribeCastDevRecord(existing.sourceUrl, existing.id, {
      userId: item.userId,
      projectId: existing.projectId,
      mode: item.mode,
      onPrepared: async ({ durationSec, modelAlias, modelId }) => {
        const reservation = await castDevBillingService.beginTranscription({
          userId: item.userId,
          projectId: existing.projectId,
          recordId: existing.id,
          durationSec,
          startedAt,
          modelAlias,
          modelId,
        });
        reservedGenerationId = reservation?.generationId ?? null;
      },
    });
    const charge = await castDevBillingService.recordTranscriptionSuccess({
      userId: item.userId,
      projectId: existing.projectId,
      recordId: existing.id,
      durationSec: result.durationSec,
      transcriptChars: result.transcriptText.length,
      chunksCount: result.chunksCount,
      fileName: result.fileName,
      mimeType: result.mimeType,
      startedAt,
      reservedGenerationId,
      modelAlias: result.modelAlias,
      modelId: result.modelId,
    });
    const currentMetadata = recordMetadata(existing.metadata);
    const queuedAt = typeof currentMetadata.transcriptionQueuedAt === 'string'
      ? currentMetadata.transcriptionQueuedAt
      : startedAt.toISOString();

    await prisma.castDevRecord.update({
      where: { id: existing.id },
      data: {
        status: 'ready_for_analysis',
        fileName: result.fileName,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        transcriptText: result.transcriptText,
        transcriptFormatted: result.transcriptText,
        errorMessage: null,
        metadata: {
          ...currentMetadata,
          transcriptionQueuedAt: queuedAt,
          transcriptionStartedAt: startedAt.toISOString(),
          transcribedAt: new Date().toISOString(),
          transcriptionModelAlias: result.modelAlias,
          transcriptionModel: result.modelId,
          transcriptionChunksCount: result.chunksCount,
          transcriptionAudioUsage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cachedInputTokens: result.usage.cachedInputTokens ?? 0,
            reasoningTokens: result.usage.reasoningTokens ?? 0,
            audioInputTokens: result.usage.audioInputTokens ?? 0,
            audioOutputTokens: result.usage.audioOutputTokens ?? 0,
          },
          transcriptionActualCostUsd: result.actualCostUsd,
          transcriptionGenerationId: charge.generationId,
          transcriptionAiPointsCharged: charge.aiPointsCharged,
          transcriptionAiBalanceRemaining: charge.aiBalanceRemaining,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error('[CastDevQueue] transcribe failed:', err);
    if (reservedGenerationId) {
      await castDevBillingService.recordTranscriptionFailure({
        userId: item.userId,
        projectId: existing.projectId,
        generationId: reservedGenerationId,
        error: err,
      }).catch((billingError) => console.error('[CastDevQueue] release failed:', billingError));
    }
    const { message } = publicErrorMessage(err);
    await prisma.castDevRecord.updateMany({
      where: { id: existing.id, userId: item.userId },
      data: {
        status: 'failed',
        errorMessage: message,
        metadata: {
          ...recordMetadata(existing.metadata),
          transcriptionFailedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
  }
}

function scheduleProcessing(): void {
  setImmediate(() => {
    processQueue().catch((err) => {
      console.error('[CastDevQueue] process error:', err);
      scheduleProcessing();
    });
  });
}

async function processQueue(): Promise<void> {
  if (activeKeys.size >= MAX_PARALLEL_TRANSCRIPTIONS) return;
  const index = selectNextCastDevQueueIndex(queue, activeUsers);
  if (index < 0) return;
  const [item] = queue.splice(index, 1);
  if (!item) return;
  const key = queueKey(item);
  queuedKeys.delete(key);
  activeKeys.add(key);
  activeUsers.add(item.userId);
  processItem(item)
    .catch((err) => console.error('[CastDevQueue] item failed:', err))
    .finally(() => {
      activeKeys.delete(key);
      activeUsers.delete(item.userId);
      if (queue.length > 0) scheduleProcessing();
    });
  if (activeKeys.size < MAX_PARALLEL_TRANSCRIPTIONS && queue.length > 0) scheduleProcessing();
}

export const castDevTranscriptionQueueService = {
  async enqueue(input: QueueItem) {
    const existing = await prisma.castDevRecord.findFirst({
      where: { id: input.recordId, userId: input.userId },
    });
    if (!existing) {
      throw Object.assign(new Error('Запись не найдена'), { status: 404 });
    }

    if (existing.status === 'transcribing') {
      const isStale = Date.now() - existing.updatedAt.getTime() > STALE_TRANSCRIBING_MS;
      if (!isStale) return existing;
    }

    const key = queueKey(input);
    if (!queuedKeys.has(key)) {
      queue.push(input);
      queuedKeys.add(key);
    }

    if (existing.status === 'queued') {
      scheduleProcessing();
      return existing;
    }

    const record = await prisma.castDevRecord.update({
      where: { id: existing.id },
      data: {
        status: 'queued',
        errorMessage: null,
        metadata: {
          ...recordMetadata(existing.metadata),
          transcriptionQueuedAt: new Date().toISOString(),
          transcriptionMode: input.mode,
        } as Prisma.InputJsonValue,
      },
    });

    scheduleProcessing();
    return record;
  },

  async recoverPending(): Promise<number> {
    const records = await prisma.castDevRecord.findMany({
      where: { status: { in: ['queued', 'transcribing'] } },
      select: { id: true, userId: true, metadata: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
    for (const record of records) {
      const metadata = recordMetadata(record.metadata);
      const item: QueueItem = {
        userId: record.userId,
        recordId: record.id,
        mode: metadata.transcriptionMode === 'diarize' ? 'diarize' : 'mini',
      };
      const key = queueKey(item);
      if (!queuedKeys.has(key) && !activeKeys.has(key)) {
        queue.push(item);
        queuedKeys.add(key);
      }
      await prisma.castDevRecord.updateMany({
        where: { id: record.id, userId: record.userId },
        data: { status: 'queued' },
      });
    }
    if (queue.length > 0) scheduleProcessing();
    return records.length;
  },
};
