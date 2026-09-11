import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { allowedSystemTelegramUserIds } from './system-telegram-webhook.service';

type SystemTelegramHealthStatus = 'ok' | 'warn' | 'fail';

function configuration() {
  const allowed = allowedSystemTelegramUserIds(env.SYSTEM_TELEGRAM_ALLOWED_USER_IDS);
  const unrestricted = allowed === null && env.SYSTEM_TELEGRAM_ALLOW_ALL;
  return {
    enabled: env.SYSTEM_TELEGRAM_ENABLED,
    workerEnabled: env.SYSTEM_TELEGRAM_WORKER_ENABLED,
    tokenConfigured: Boolean(env.SYSTEM_TELEGRAM_BOT_TOKEN),
    webhookSecretConfigured: Boolean(env.SYSTEM_TELEGRAM_WEBHOOK_SECRET),
    allowlistCount: allowed?.length ?? 0,
    unrestricted,
  };
}

async function queueMetrics() {
  const [groups, oldestPending] = await Promise.all([
    prisma.systemTelegramUpdate.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.systemTelegramUpdate.findFirst({
      where: { status: 'PENDING' },
      orderBy: { receivedAt: 'asc' },
      select: { receivedAt: true },
    }),
  ]);

  const counts = { PENDING: 0, PROCESSING: 0, PROCESSED: 0, DEAD: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return {
    counts,
    oldestPendingAt: oldestPending?.receivedAt ?? null,
  };
}

async function deadLetters() {
  return prisma.systemTelegramUpdate.findMany({
    where: { status: 'DEAD' },
    orderBy: { failedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      attempts: true,
      maxAttempts: true,
      outcome: true,
      lastErrorCode: true,
      lastError: true,
      receivedAt: true,
      failedAt: true,
    },
  });
}

export const systemTelegramAdminService = {
  async snapshot() {
    const [metrics, failedUpdates] = await Promise.all([queueMetrics(), deadLetters()]);
    return {
      configuration: configuration(),
      queue: { ...metrics, deadLetters: failedUpdates },
      generatedAt: new Date().toISOString(),
    };
  },

  async health(): Promise<{ status: SystemTelegramHealthStatus; details: Record<string, unknown> }> {
    const config = configuration();
    if (!config.enabled) return { status: 'ok', details: { enabled: false } };

    const configured = config.tokenConfigured
      && config.webhookSecretConfigured
      && (config.unrestricted || config.allowlistCount > 0);
    if (!configured) {
      return { status: 'fail', details: { ...config, reason: 'configuration_incomplete' } };
    }
    if (!config.workerEnabled) {
      return { status: 'fail', details: { ...config, reason: 'worker_disabled' } };
    }

    try {
      const queue = await queueMetrics();
      const oldestPendingAgeSeconds = queue.oldestPendingAt
        ? Math.max(0, Math.floor((Date.now() - queue.oldestPendingAt.getTime()) / 1_000))
        : 0;
      const status: SystemTelegramHealthStatus = queue.counts.DEAD > 0 || oldestPendingAgeSeconds > 300
        ? 'warn'
        : 'ok';
      return {
        status,
        details: {
          enabled: true,
          unrestricted: config.unrestricted,
          counts: queue.counts,
          oldestPendingAgeSeconds,
        },
      };
    } catch {
      return { status: 'fail', details: { enabled: true, reason: 'queue_unavailable' } };
    }
  },
};
