import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AccessPolicyError } from './access-policy.service';
import { castDevBillingService } from './castdev-billing.service';
import { CastDevTranscriptionError, transcribeCastDevRecord } from './castdev-transcription.service';

type QueueItem = {
  userId: string;
  recordId: string;
};

const STALE_TRANSCRIBING_MS = 30 * 60 * 1000;
const queue: QueueItem[] = [];
const queuedKeys = new Set<string>();
let active = false;

function queueKey(item: QueueItem): string {
  return `${item.userId}:${item.recordId}`;
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

  try {
    const result = await transcribeCastDevRecord(existing.sourceUrl, existing.id, {
      onPrepared: ({ durationSec }) => castDevBillingService.assertCanTranscribe({
        userId: item.userId,
        projectId: existing.projectId,
        recordId: existing.id,
        durationSec,
      }),
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
    });

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
          ...recordMetadata(existing.metadata),
          transcriptionQueuedAt: recordMetadata(existing.metadata).transcriptionQueuedAt ?? startedAt.toISOString(),
          transcriptionStartedAt: startedAt.toISOString(),
          transcribedAt: new Date().toISOString(),
          transcriptionModel: process.env['OPENAI_TRANSCRIPTION_MODEL'] ?? 'gpt-4o-mini-transcribe',
          transcriptionChunksCount: result.chunksCount,
          transcriptionGenerationId: charge.generationId,
          transcriptionAiPointsCharged: charge.aiPointsCharged,
          transcriptionAiBalanceRemaining: charge.aiBalanceRemaining,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error('[CastDevQueue] transcribe failed:', err);
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
      active = false;
      console.error('[CastDevQueue] process error:', err);
      scheduleProcessing();
    });
  });
}

async function processQueue(): Promise<void> {
  if (active) return;
  const item = queue.shift();
  if (!item) return;
  active = true;
  queuedKeys.delete(queueKey(item));
  try {
    await processItem(item);
  } finally {
    active = false;
    if (queue.length > 0) scheduleProcessing();
  }
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
        } as Prisma.InputJsonValue,
      },
    });

    scheduleProcessing();
    return record;
  },
};
