import { randomUUID } from 'crypto';
import { TelegramBotApiError } from './telegram-bot.service';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { safeTelegramErrorMessage } from './telegram-secret.service';
import { systemTelegramHandlerService } from './system-telegram-handler.service';

interface SystemWorkerStats {
  processed: number;
  failed: number;
}

function retryDelayMs(attempt: number, key: string): number {
  const base = Math.min(30 * 60 * 1000, 5_000 * (2 ** Math.max(0, attempt - 1)));
  const jitter = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 1_000;
  return base + jitter;
}

function errorCode(error: unknown): string {
  if (error instanceof TelegramBotApiError) return error.code;
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return 'SYSTEM_TELEGRAM_PROCESSING_FAILED';
}

function mayRetry(error: unknown): boolean {
  return error instanceof TelegramBotApiError
    && (error.code === 'TELEGRAM_RATE_LIMITED' || error.code === 'TELEGRAM_API_ERROR');
}

async function claim(workerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const candidate = await prisma.systemTelegramUpdate.findFirst({
      where: {
        status: 'PENDING',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { receivedAt: 'asc' },
    });
    if (!candidate) return null;

    const claimed = await prisma.systemTelegramUpdate.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
        lastErrorCode: null,
        lastError: null,
      },
    });
    if (claimed.count === 1) {
      return {
        ...candidate,
        status: 'PROCESSING' as const,
        attempts: candidate.attempts + 1,
        lockedAt: now,
        lockedBy: workerId,
      };
    }
  }
  return null;
}

async function complete(
  update: NonNullable<Awaited<ReturnType<typeof claim>>>,
  result: Awaited<ReturnType<typeof systemTelegramHandlerService.process>>,
): Promise<void> {
  await prisma.systemTelegramUpdate.updateMany({
    where: { id: update.id, status: 'PROCESSING', lockedBy: update.lockedBy },
    data: {
      status: 'PROCESSED',
      telegramAccountId: result.telegramAccountId,
      outcome: result.outcome,
      processedAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null,
      lastError: null,
    },
  });
}

async function fail(
  update: NonNullable<Awaited<ReturnType<typeof claim>>>,
  error: unknown,
): Promise<void> {
  const retryable = mayRetry(error) && update.attempts < update.maxAttempts;
  const retryAfterSeconds = error instanceof TelegramBotApiError ? error.retryAfterSeconds : null;
  const nextAttemptAt = retryable
    ? new Date(Date.now() + (retryAfterSeconds
      ? retryAfterSeconds * 1_000
      : retryDelayMs(update.attempts, update.id)))
    : null;
  await prisma.systemTelegramUpdate.updateMany({
    where: { id: update.id, status: 'PROCESSING', lockedBy: update.lockedBy },
    data: {
      status: retryable ? 'PENDING' : 'DEAD',
      nextAttemptAt,
      failedAt: retryable ? null : new Date(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: errorCode(error),
      lastError: safeTelegramErrorMessage(error).slice(0, 2_000),
    },
  });
}

async function recoverStale(): Promise<number> {
  const staleBefore = new Date(Date.now() - env.SYSTEM_TELEGRAM_LOCK_TIMEOUT_SECONDS * 1_000);
  const recovered = await prisma.systemTelegramUpdate.updateMany({
    where: { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
    data: {
      status: 'DEAD',
      failedAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: 'SYSTEM_TELEGRAM_OUTCOME_UNKNOWN',
      lastError: 'Worker остановился во время внешнего действия; автоматический retry отключён для защиты от дубля',
    },
  });
  return recovered.count;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export const systemTelegramWorkerService = {
  recoverStale,

  async processOnce(workerId = `system-telegram-${randomUUID()}`): Promise<SystemWorkerStats> {
    if (running) return { processed: 0, failed: 0 };
    running = true;
    const stats: SystemWorkerStats = { processed: 0, failed: 0 };
    try {
      for (let index = 0; index < env.SYSTEM_TELEGRAM_BATCH_SIZE; index += 1) {
        const update = await claim(workerId);
        if (!update) break;
        try {
          const result = await systemTelegramHandlerService.process(update.payload);
          await complete(update, result);
          stats.processed += 1;
        } catch (error) {
          await fail(update, error);
          stats.failed += 1;
          console.error('[SystemTelegramWorker] update failed', {
            updateId: update.id,
            code: errorCode(error),
            message: safeTelegramErrorMessage(error),
          });
        }
      }
      return stats;
    } finally {
      running = false;
    }
  },

  async start(): Promise<boolean> {
    if (!env.SYSTEM_TELEGRAM_ENABLED || !env.SYSTEM_TELEGRAM_WORKER_ENABLED || timer) return false;
    if (!env.SYSTEM_TELEGRAM_BOT_TOKEN || !env.SYSTEM_TELEGRAM_WEBHOOK_SECRET) {
      throw new Error('SYSTEM_TELEGRAM_NOT_CONFIGURED');
    }
    const recovered = await recoverStale();
    console.log('[SystemTelegramWorker] started', { recovered });
    timer = setInterval(() => {
      void this.processOnce().catch((error) => {
        console.error('[SystemTelegramWorker] polling failed', {
          message: safeTelegramErrorMessage(error),
        });
      });
    }, env.SYSTEM_TELEGRAM_POLL_INTERVAL_MS);
    void this.processOnce();
    return true;
  },

  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  },
};

export const systemTelegramWorkerInternals = {
  retryDelayMs,
  mayRetry,
  errorCode,
};
