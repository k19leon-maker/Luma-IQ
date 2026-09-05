import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type TelegramRuntimeQueue = 'inbound' | 'delivery';

const SAFE_DELIVERY_ERROR_CODES = new Set([
  'TELEGRAM_RATE_LIMITED',
  'TELEGRAM_API_ERROR',
]);

export class TelegramRuntimeAdminError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TelegramRuntimeAdminError';
  }
}

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function recoverInbound(jobId: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.botInboundUpdate.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new TelegramRuntimeAdminError('Входящее задание не найдено', 404, 'INBOUND_JOB_NOT_FOUND');
    }
    if (job.status !== 'DEAD') {
      throw new TelegramRuntimeAdminError('Восстановить можно только задание в статусе DEAD', 409, 'JOB_NOT_DEAD');
    }

    const changed = await tx.botInboundUpdate.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        botId: job.botId,
        status: 'DEAD',
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        failedAt: null,
        lastError: null,
      },
    });
    if (changed.count !== 1) {
      throw new TelegramRuntimeAdminError('Статус задания уже изменился', 409, 'JOB_STATE_CHANGED');
    }

    await tx.botEvent.create({
      data: {
        userId: job.userId,
        botId: job.botId,
        eventType: 'ADMIN_INBOUND_JOB_RECOVERED',
        sourceId: job.id,
        idempotencyKey: `admin-recovery:inbound:${job.id}:${randomUUID()}`,
        metadata: {
          adminUserId,
          previousAttempts: job.attempts,
        },
      },
    });

    return { queue: 'inbound' as const, jobId: job.id, status: 'PENDING' as const };
  });
}

async function recoverDelivery(jobId: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.botMessageDelivery.findUnique({
      where: { id: jobId },
      include: {
        bot: { select: { status: true, deletedAt: true } },
        subscriber: { select: { status: true, archivedAt: true } },
        enrollment: { select: { id: true, status: true, currentNodeId: true } },
      },
    });
    if (!job) {
      throw new TelegramRuntimeAdminError('Задание доставки не найдено', 404, 'DELIVERY_JOB_NOT_FOUND');
    }
    if (job.status !== 'DEAD') {
      throw new TelegramRuntimeAdminError('Восстановить можно только задание в статусе DEAD', 409, 'JOB_NOT_DEAD');
    }
    if (job.telegramMessageId || job.sentAt) {
      throw new TelegramRuntimeAdminError('Доставка уже имеет подтверждение отправки', 409, 'DELIVERY_ALREADY_SENT');
    }

    const payload = jsonObject(job.payload);
    const isInternalResume = payload.kind === 'resume';
    if (!isInternalResume && !SAFE_DELIVERY_ERROR_CODES.has(job.lastErrorCode ?? '')) {
      const code = job.lastErrorCode === 'DELIVERY_OUTCOME_UNKNOWN'
        ? 'DELIVERY_OUTCOME_UNKNOWN'
        : 'DELIVERY_RETRY_NOT_SAFE';
      throw new TelegramRuntimeAdminError(
        'Повтор этой доставки заблокирован: сначала нужна ручная сверка с Telegram',
        409,
        code,
      );
    }
    if (job.bot.status !== 'ACTIVE' || job.bot.deletedAt) {
      throw new TelegramRuntimeAdminError('Бот не активен', 409, 'BOT_NOT_ACTIVE');
    }
    if (job.subscriber.status !== 'ACTIVE' || job.subscriber.archivedAt) {
      throw new TelegramRuntimeAdminError('Подписчик не активен', 409, 'SUBSCRIBER_NOT_ACTIVE');
    }

    if (job.enrollment?.status === 'FAILED') {
      const sentForNode = await tx.botMessageDelivery.count({
        where: {
          id: { not: job.id },
          userId: job.userId,
          botId: job.botId,
          subscriberId: job.subscriberId,
          enrollmentId: job.enrollment.id,
          nodeId: job.nodeId,
          status: 'SENT',
        },
      });
      if (sentForNode > 0) {
        throw new TelegramRuntimeAdminError(
          'Для этого шага уже есть успешная доставка',
          409,
          'DELIVERY_DUPLICATE_RISK',
        );
      }
      if (job.enrollment.currentNodeId !== job.nodeId) {
        throw new TelegramRuntimeAdminError(
          'Сценарий уже перешёл на другой шаг',
          409,
          'ENROLLMENT_NODE_CHANGED',
        );
      }
    }

    const changed = await tx.botMessageDelivery.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        botId: job.botId,
        subscriberId: job.subscriberId,
        status: 'DEAD',
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        scheduledAt: new Date(),
        nextAttemptAt: new Date(),
        rateLimitReservedAt: null,
        lockedAt: null,
        lockedBy: null,
        failedAt: null,
        lastErrorCode: null,
        lastError: null,
      },
    });
    if (changed.count !== 1) {
      throw new TelegramRuntimeAdminError('Статус задания уже изменился', 409, 'JOB_STATE_CHANGED');
    }

    if (job.enrollment?.status === 'FAILED') {
      const enrollmentChanged = await tx.botScenarioEnrollment.updateMany({
        where: {
          id: job.enrollment.id,
          userId: job.userId,
          botId: job.botId,
          subscriberId: job.subscriberId,
          currentNodeId: job.nodeId,
          status: 'FAILED',
        },
        data: {
          status: 'ACTIVE',
          nextActionAt: null,
          lastError: null,
        },
      });
      if (enrollmentChanged.count !== 1) {
        throw new TelegramRuntimeAdminError(
          'Состояние запуска сценария уже изменилось',
          409,
          'ENROLLMENT_STATE_CHANGED',
        );
      }
    }

    await tx.botEvent.create({
      data: {
        userId: job.userId,
        botId: job.botId,
        subscriberId: job.subscriberId,
        enrollmentId: job.enrollmentId,
        scenarioId: job.scenarioId,
        eventType: 'ADMIN_DELIVERY_JOB_RECOVERED',
        nodeId: job.nodeId,
        sourceId: job.id,
        idempotencyKey: `admin-recovery:delivery:${job.id}:${randomUUID()}`,
        metadata: {
          adminUserId,
          previousAttempts: job.attempts,
          previousErrorCode: job.lastErrorCode,
        },
      },
    });

    return { queue: 'delivery' as const, jobId: job.id, status: 'PENDING' as const };
  });
}

export const telegramRuntimeAdminService = {
  recoverJob(queue: TelegramRuntimeQueue, jobId: string, adminUserId: string) {
    return queue === 'inbound'
      ? recoverInbound(jobId, adminUserId)
      : recoverDelivery(jobId, adminUserId);
  },
};
