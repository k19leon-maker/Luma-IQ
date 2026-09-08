import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { TelegramBotApiError } from './telegram-bot.service';
import { TelegramBotAssetError } from './telegram-bot-asset.service';
import { safeTelegramErrorMessage } from './telegram-secret.service';
import {
  recordTelegramRuntimeErrorEvent,
  TelegramRuntimeDataError,
  telegramRuntimeV2Service,
} from './telegram-runtime-v2.service';
import { telegramConferenceSheetsService } from './telegram-conference-sheets.service';

interface WorkerStats {
  inboundProcessed: number;
  deliveriesProcessed: number;
  failed: number;
}

function allowedBotIds(raw: string): string[] | null {
  const values = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  return values.includes('*') ? null : values;
}

function botIdFilter(): { in: string[] } | undefined {
  const allowed = allowedBotIds(env.TELEGRAM_RUNTIME_V2_ALLOWED_BOT_IDS);
  return allowed === null ? undefined : { in: allowed };
}

function retryDelayMs(attempt: number, key: string): number {
  const base = Math.min(60 * 60 * 1000, 5_000 * (2 ** Math.max(0, attempt - 1)));
  const jitter = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1_000;
  return base + jitter;
}

function errorCode(error: unknown): string {
  if (error instanceof TelegramBotApiError || error instanceof TelegramRuntimeDataError || error instanceof TelegramBotAssetError) return error.code;
  return 'TELEGRAM_RUNTIME_ERROR';
}

function deliveryMayRetry(error: unknown): boolean {
  if (!(error instanceof TelegramBotApiError)) return false;
  return error.code === 'TELEGRAM_RATE_LIMITED' || error.code === 'TELEGRAM_API_ERROR';
}

function rateLimitIntervalMs(ratePerSecond: number): number {
  return Math.ceil(1_000 / ratePerSecond);
}

function latestRateLimitSlot(now: Date, nextAvailable: Date[]): Date {
  return new Date(Math.max(now.getTime(), ...nextAvailable.map((value) => value.getTime())));
}

function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function reserveDeliveryRateLimit(input: {
  botId: string;
  subscriberId: string;
  now: Date;
}): Promise<Date> {
  const scopes = [
    {
      scopeKey: 'telegram:user-runtime:global',
      intervalMs: rateLimitIntervalMs(env.TELEGRAM_RUNTIME_GLOBAL_RATE_PER_SECOND),
    },
    {
      scopeKey: `telegram:user-runtime:bot:${input.botId}`,
      intervalMs: rateLimitIntervalMs(env.TELEGRAM_RUNTIME_BOT_RATE_PER_SECOND),
    },
    {
      scopeKey: `telegram:user-runtime:chat:${input.botId}:${input.subscriberId}`,
      intervalMs: rateLimitIntervalMs(env.TELEGRAM_RUNTIME_CHAT_RATE_PER_SECOND),
    },
  ];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        for (const scope of scopes) {
          await tx.telegramRateLimitBucket.upsert({
            where: { scopeKey: scope.scopeKey },
            create: { scopeKey: scope.scopeKey, nextAvailableAt: input.now },
            update: {},
          });
        }
        const buckets = await tx.telegramRateLimitBucket.findMany({
          where: { scopeKey: { in: scopes.map((scope) => scope.scopeKey) } },
          select: { scopeKey: true, nextAvailableAt: true },
        });
        if (buckets.length !== scopes.length) {
          throw new TelegramRuntimeDataError('Не удалось зарезервировать лимит Telegram', 'RATE_LIMIT_BUCKET_MISSING');
        }
        const slot = latestRateLimitSlot(input.now, buckets.map((bucket) => bucket.nextAvailableAt));
        for (const scope of scopes) {
          await tx.telegramRateLimitBucket.update({
            where: { scopeKey: scope.scopeKey },
            data: { nextAvailableAt: new Date(slot.getTime() + scope.intervalMs) },
          });
        }
        return slot;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === 4) throw error;
    }
  }
  throw new TelegramRuntimeDataError('Не удалось зарезервировать лимит Telegram', 'RATE_LIMIT_RESERVATION_FAILED');
}

async function claimInbound(workerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const candidate = await prisma.botInboundUpdate.findFirst({
      where: {
        botId: botIdFilter(),
        status: 'PENDING',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { receivedAt: 'asc' },
    });
    if (!candidate) return null;
    const claimed = await prisma.botInboundUpdate.updateMany({
      where: {
        id: candidate.id,
        userId: candidate.userId,
        botId: candidate.botId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count === 1) return { ...candidate, attempts: candidate.attempts + 1 };
  }
  return null;
}

async function claimDelivery(workerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const candidate = await prisma.botMessageDelivery.findFirst({
      where: {
        botId: botIdFilter(),
        status: 'PENDING',
        scheduledAt: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        bot: { status: 'ACTIVE', deletedAt: null },
        subscriber: { status: 'ACTIVE', archivedAt: null },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;
    if (!candidate.rateLimitReservedAt) {
      const reservedAt = await reserveDeliveryRateLimit({
        botId: candidate.botId,
        subscriberId: candidate.subscriberId,
        now,
      });
      const reserved = await prisma.botMessageDelivery.updateMany({
        where: {
          id: candidate.id,
          userId: candidate.userId,
          botId: candidate.botId,
          subscriberId: candidate.subscriberId,
          status: 'PENDING',
          rateLimitReservedAt: null,
        },
        data: {
          rateLimitReservedAt: reservedAt,
          nextAttemptAt: reservedAt,
        },
      });
      if (reserved.count !== 1 || reservedAt.getTime() > Date.now()) continue;
    }
    const claimed = await prisma.botMessageDelivery.updateMany({
      where: {
        id: candidate.id,
        userId: candidate.userId,
        botId: candidate.botId,
        subscriberId: candidate.subscriberId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
        lastErrorCode: null,
        lastError: null,
      },
    });
    if (claimed.count === 1) return { ...candidate, attempts: candidate.attempts + 1 };
  }
  return null;
}

async function completeInbound(update: NonNullable<Awaited<ReturnType<typeof claimInbound>>>): Promise<void> {
  await prisma.botInboundUpdate.updateMany({
    where: {
      id: update.id,
      userId: update.userId,
      botId: update.botId,
      status: 'PROCESSING',
    },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

async function failInbound(
  update: NonNullable<Awaited<ReturnType<typeof claimInbound>>>,
  error: unknown,
): Promise<void> {
  const exhausted = update.attempts >= update.maxAttempts;
  await prisma.botInboundUpdate.updateMany({
    where: {
      id: update.id,
      userId: update.userId,
      botId: update.botId,
      status: 'PROCESSING',
    },
    data: {
      status: exhausted ? 'DEAD' : 'PENDING',
      nextAttemptAt: exhausted ? null : new Date(Date.now() + retryDelayMs(update.attempts, update.id)),
      failedAt: exhausted ? new Date() : null,
      lockedAt: null,
      lockedBy: null,
      lastError: safeTelegramErrorMessage(error).slice(0, 2_000),
    },
  });
}

async function markSubscriberBlocked(delivery: NonNullable<Awaited<ReturnType<typeof claimDelivery>>>): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.botSubscriber.updateMany({
      where: { id: delivery.subscriberId, userId: delivery.userId, botId: delivery.botId },
      data: { status: 'BLOCKED', blockedAt: now, stoppedAt: now },
    });
    await tx.botScenarioEnrollment.updateMany({
      where: {
        userId: delivery.userId,
        botId: delivery.botId,
        subscriberId: delivery.subscriberId,
        status: { in: ['ACTIVE', 'WAITING'] },
      },
      data: { status: 'STOPPED', stoppedAt: now, nextActionAt: null },
    });
    await tx.botMessageDelivery.updateMany({
      where: {
        userId: delivery.userId,
        botId: delivery.botId,
        subscriberId: delivery.subscriberId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED', failedAt: now, nextAttemptAt: null },
    });
  });
}

async function markBotTokenInvalid(
  delivery: NonNullable<Awaited<ReturnType<typeof claimDelivery>>>,
  error: unknown,
): Promise<void> {
  await prisma.telegramBot.updateMany({
    where: { id: delivery.botId, userId: delivery.userId, deletedAt: null },
    data: {
      status: 'ERROR',
      lastError: safeTelegramErrorMessage(error).slice(0, 2_000),
      lastHealthCheckAt: new Date(),
    },
  });
}

async function failDelivery(
  delivery: NonNullable<Awaited<ReturnType<typeof claimDelivery>>>,
  error: unknown,
): Promise<void> {
  const code = errorCode(error);
  const retryable = deliveryMayRetry(error) && delivery.attempts < delivery.maxAttempts;
  const retryAfterSeconds = error instanceof TelegramBotApiError
    ? error.retryAfterSeconds
    : null;
  const nextAttemptAt = retryable
    ? new Date(Date.now() + (retryAfterSeconds
      ? retryAfterSeconds * 1_000
      : retryDelayMs(delivery.attempts, delivery.id)))
    : null;
  const now = new Date();

  await prisma.botMessageDelivery.updateMany({
    where: {
      id: delivery.id,
      userId: delivery.userId,
      botId: delivery.botId,
      subscriberId: delivery.subscriberId,
      status: 'PROCESSING',
    },
    data: {
      status: retryable ? 'PENDING' : 'DEAD',
      nextAttemptAt,
      failedAt: retryable ? null : now,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: code,
      lastError: safeTelegramErrorMessage(error).slice(0, 2_000),
      rateLimitReservedAt: retryable ? null : delivery.rateLimitReservedAt,
    },
  });

  if (!retryable && delivery.enrollmentId) {
    await prisma.botScenarioEnrollment.updateMany({
      where: {
        id: delivery.enrollmentId,
        userId: delivery.userId,
        botId: delivery.botId,
        subscriberId: delivery.subscriberId,
        status: { in: ['ACTIVE', 'WAITING'] },
      },
      data: {
        status: 'FAILED',
        nextActionAt: null,
        lastError: safeTelegramErrorMessage(error).slice(0, 2_000),
      },
    });
  }
  if (code === 'TELEGRAM_BOT_BLOCKED') await markSubscriberBlocked(delivery);
  if (code === 'INVALID_TELEGRAM_BOT_TOKEN') await markBotTokenInvalid(delivery, error);
}

async function recoverStaleJobs(): Promise<{
  inbound: number;
  deliveries: number;
  enrollmentsFailed: number;
}> {
  const staleBefore = new Date(Date.now() - env.TELEGRAM_RUNTIME_LOCK_TIMEOUT_SECONDS * 1_000);
  const now = new Date();
  const [inbound, enrollments, deliveries] = await prisma.$transaction([
    prisma.botInboundUpdate.updateMany({
      where: { botId: botIdFilter(), status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      data: {
        status: 'PENDING',
        nextAttemptAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: 'Восстановлено после остановки worker до выполнения внешнего действия',
      },
    }),
    prisma.botScenarioEnrollment.updateMany({
      where: {
        botId: botIdFilter(),
        status: { in: ['ACTIVE', 'WAITING'] },
        deliveries: {
          some: { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
        },
      },
      data: {
        status: 'FAILED',
        nextActionAt: null,
        lastError: 'Исход отправки неизвестен после остановки worker; цепочка остановлена для защиты от дубля',
      },
    }),
    prisma.botMessageDelivery.updateMany({
      where: { botId: botIdFilter(), status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      data: {
        status: 'DEAD',
        nextAttemptAt: null,
        failedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: 'DELIVERY_OUTCOME_UNKNOWN',
        lastError: 'Worker остановился во время отправки; автоматический retry отключён для защиты от дубля',
      },
    }),
  ]);
  return {
    inbound: inbound.count,
    deliveries: deliveries.count,
    enrollmentsFailed: enrollments.count,
  };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export const telegramRuntimeWorkerService = {
  async recoverStale(): Promise<{
    inbound: number;
    deliveries: number;
    enrollmentsFailed: number;
  }> {
    return recoverStaleJobs();
  },

  async processOnce(workerId = `telegram-runtime-${randomUUID()}`): Promise<WorkerStats> {
    if (running) return { inboundProcessed: 0, deliveriesProcessed: 0, failed: 0 };
    running = true;
    const stats: WorkerStats = { inboundProcessed: 0, deliveriesProcessed: 0, failed: 0 };
    try {
      for (let index = 0; index < env.TELEGRAM_RUNTIME_BATCH_SIZE; index += 1) {
        const update = await claimInbound(workerId);
        if (!update) break;
        try {
          if (telegramConferenceSheetsService.handles(update.botId)) {
            await telegramConferenceSheetsService.processInboundUpdate(update);
          } else {
            await telegramRuntimeV2Service.processInboundUpdate(update);
          }
          await completeInbound(update);
          stats.inboundProcessed += 1;
        } catch (error) {
          await failInbound(update, error);
          await recordTelegramRuntimeErrorEvent({
            userId: update.userId,
            botId: update.botId,
            sourceId: update.id,
            queue: 'inbound',
            code: errorCode(error),
          }).catch(() => undefined);
          stats.failed += 1;
          console.error('[TelegramRuntimeV2] inbound failed', {
            updateId: update.id,
            code: errorCode(error),
            message: safeTelegramErrorMessage(error),
          });
        }
      }

      for (let index = 0; index < env.TELEGRAM_RUNTIME_BATCH_SIZE; index += 1) {
        const delivery = await claimDelivery(workerId);
        if (!delivery) break;
        try {
          await telegramRuntimeV2Service.processDelivery(delivery);
          stats.deliveriesProcessed += 1;
        } catch (error) {
          await failDelivery(delivery, error);
          await recordTelegramRuntimeErrorEvent({
            userId: delivery.userId,
            botId: delivery.botId,
            subscriberId: delivery.subscriberId,
            enrollmentId: delivery.enrollmentId,
            scenarioId: delivery.scenarioId,
            sourceId: delivery.id,
            queue: 'delivery',
            code: errorCode(error),
          }).catch(() => undefined);
          stats.failed += 1;
          console.error('[TelegramRuntimeV2] delivery failed', {
            deliveryId: delivery.id,
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
    if (!env.TELEGRAM_RUNTIME_V2_ENABLED || timer) return false;
    const recovered = await recoverStaleJobs();
    const allowed = allowedBotIds(env.TELEGRAM_RUNTIME_V2_ALLOWED_BOT_IDS);
    console.log('[TelegramRuntimeV2] worker started', {
      recovered,
      botScope: allowed === null ? 'all' : allowed.length,
    });
    timer = setInterval(() => {
      void this.processOnce().catch((error) => {
        console.error('[TelegramRuntimeV2] polling failed', { message: safeTelegramErrorMessage(error) });
      });
    }, env.TELEGRAM_RUNTIME_POLL_INTERVAL_MS);
    void this.processOnce();
    return true;
  },

  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  },
};

export const telegramRuntimeWorkerInternals = {
  retryDelayMs,
  deliveryMayRetry,
  rateLimitIntervalMs,
  latestRateLimitSlot,
  allowedBotIds,
};
