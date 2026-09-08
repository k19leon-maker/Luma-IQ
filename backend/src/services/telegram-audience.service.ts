import { randomUUID } from 'crypto';
import { BotSubscriberStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class TelegramAudienceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TelegramAudienceError';
  }
}

interface SubscriberFilters {
  status?: BotSubscriberStatus;
  search?: string;
}

interface AnalyticsFilters {
  from?: Date;
  to?: Date;
  projectId?: string;
}

const subscriberSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  languageCode: true,
  status: true,
  source: true,
  firstSeenAt: true,
  lastSeenAt: true,
  tags: {
    select: {
      assignedAt: true,
      tag: { select: { id: true, name: true, color: true } },
    },
    orderBy: { assignedAt: 'asc' as const },
  },
  enrollments: {
    where: { source: { not: 'owner_test' } },
    select: {
      id: true,
      status: true,
      currentNodeId: true,
      source: true,
      startParameter: true,
      startedAt: true,
      lastActivityAt: true,
      completedAt: true,
      stoppedAt: true,
      scenario: { select: { id: true, name: true, status: true } },
    },
    orderBy: { lastActivityAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.BotSubscriberSelect;

async function assertOwnedBot(userId: string, botId: string) {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: botId, userId, deletedAt: null },
    select: { id: true, username: true, displayName: true, status: true },
  });
  if (!bot) throw new TelegramAudienceError('Бот не найден', 404, 'TELEGRAM_BOT_NOT_FOUND');
  return bot;
}

async function assertOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!project) throw new TelegramAudienceError('Проект не найден', 404, 'PROJECT_NOT_FOUND');
}

function subscriberWhere(userId: string, botId: string, filters: SubscriberFilters): Prisma.BotSubscriberWhereInput {
  const search = filters.search?.trim();
  return {
    userId,
    botId,
    archivedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(search ? {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };
}

function publicSubscriber<T extends { tags: Array<{ assignedAt: Date; tag: unknown }>; enrollments: unknown[] }>(subscriber: T) {
  const { tags, enrollments, ...profile } = subscriber;
  return {
    ...profile,
    tags: tags.map((item) => ({ ...item.tag as object, assignedAt: item.assignedAt })),
    currentEnrollment: enrollments[0] ?? null,
  };
}

function safeCsvValue(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const telegramAudienceService = {
  async listSubscribers(userId: string, botId: string, filters: SubscriberFilters & { limit: number; offset: number }) {
    const bot = await assertOwnedBot(userId, botId);
    const where = subscriberWhere(userId, botId, filters);
    const [total, subscribers] = await Promise.all([
      prisma.botSubscriber.count({ where }),
      prisma.botSubscriber.findMany({
        where,
        select: subscriberSelect,
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
        take: filters.limit,
        skip: filters.offset,
      }),
    ]);
    return {
      bot,
      subscribers: subscribers.map(publicSubscriber),
      pagination: { total, limit: filters.limit, offset: filters.offset, hasMore: filters.offset + subscribers.length < total },
    };
  },

  async getSubscriber(userId: string, botId: string, subscriberId: string) {
    await assertOwnedBot(userId, botId);
    const subscriber = await prisma.botSubscriber.findFirst({
      where: { id: subscriberId, userId, botId, archivedAt: null },
      select: {
        ...subscriberSelect,
        enrollments: {
          where: { source: { not: 'owner_test' } },
          select: subscriberSelect.enrollments.select,
          orderBy: { lastActivityAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!subscriber) throw new TelegramAudienceError('Подписчик не найден', 404, 'TELEGRAM_SUBSCRIBER_NOT_FOUND');
    const [sent, failed, clicks, goals] = await Promise.all([
      prisma.botMessageDelivery.count({ where: { userId, botId, subscriberId, status: 'SENT', enrollment: { source: { not: 'owner_test' } } } }),
      prisma.botMessageDelivery.count({ where: { userId, botId, subscriberId, status: { in: ['FAILED', 'DEAD'] }, enrollment: { source: { not: 'owner_test' } } } }),
      prisma.botEvent.count({ where: { userId, botId, subscriberId, eventType: 'BUTTON_CLICKED', enrollment: { source: { not: 'owner_test' } } } }),
      prisma.botEvent.count({ where: { userId, botId, subscriberId, eventType: 'GOAL_REACHED', enrollment: { source: { not: 'owner_test' } } } }),
    ]);
    const { tags, enrollments, ...profile } = subscriber;
    return {
      ...profile,
      tags: tags.map((item) => ({ ...item.tag, assignedAt: item.assignedAt })),
      enrollments,
      activity: { delivered: sent, failed, buttonClicks: clicks, goalsReached: goals },
    };
  },

  async analytics(userId: string, botId: string, filters: AnalyticsFilters) {
    const bot = await assertOwnedBot(userId, botId);
    if (filters.projectId) await assertOwnedProject(userId, filters.projectId);
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const time = { gte: from, lte: to };
    const enrollmentWhere: Prisma.BotScenarioEnrollmentWhereInput = {
      userId,
      botId,
      source: { not: 'owner_test' },
      startedAt: time,
      ...(filters.projectId ? { scenario: { projectId: filters.projectId, userId } } : {}),
    };
    const linkedEnrollment = {
      source: { not: 'owner_test' },
      ...(filters.projectId ? { scenario: { projectId: filters.projectId, userId } } : {}),
    };
    const deliveryWhere: Prisma.BotMessageDeliveryWhereInput = {
      userId,
      botId,
      createdAt: time,
      enrollment: linkedEnrollment,
    };
    const eventWhere: Prisma.BotEventWhereInput = {
      userId,
      botId,
      createdAt: time,
      enrollment: linkedEnrollment,
    };
    const [activeSubscribers, newSubscribers, entries, completed, delivered, failed, buttonClicks, goalsReached, statusGroups] = await Promise.all([
      prisma.botSubscriber.count({ where: { userId, botId, status: 'ACTIVE', archivedAt: null } }),
      prisma.botSubscriber.count({ where: { userId, botId, archivedAt: null, firstSeenAt: time } }),
      prisma.botScenarioEnrollment.count({ where: enrollmentWhere }),
      prisma.botScenarioEnrollment.count({ where: { ...enrollmentWhere, status: 'COMPLETED' } }),
      prisma.botMessageDelivery.count({ where: { ...deliveryWhere, status: 'SENT' } }),
      prisma.botMessageDelivery.count({ where: { ...deliveryWhere, status: { in: ['FAILED', 'DEAD'] } } }),
      prisma.botEvent.count({ where: { ...eventWhere, eventType: 'BUTTON_CLICKED' } }),
      prisma.botEvent.count({ where: { ...eventWhere, eventType: 'GOAL_REACHED' } }),
      prisma.botSubscriber.groupBy({
        by: ['status'],
        where: { userId, botId, archivedAt: null },
        _count: { _all: true },
      }),
    ]);
    return {
      bot,
      period: { from, to },
      metrics: { activeSubscribers, newSubscribers, entries, completed, delivered, failed, buttonClicks, goalsReached },
      subscriberStatuses: Object.fromEntries(statusGroups.map((item) => [item.status, item._count._all])),
      semantics: {
        telegramReadReceiptsSupported: false,
        note: 'Telegram Bot API подтверждает доставку запроса, но не сообщает о прочтении сообщения.',
      },
    };
  },

  async exportSubscribersCsv(userId: string, botId: string, filters: SubscriberFilters) {
    const bot = await assertOwnedBot(userId, botId);
    const subscribers = await prisma.botSubscriber.findMany({
      where: subscriberWhere(userId, botId, filters),
      select: subscriberSelect,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: 10_000,
    });
    const header = ['subscriber_id', 'telegram_username', 'first_name', 'last_name', 'status', 'source', 'tags', 'current_scenario', 'scenario_status', 'first_seen_at', 'last_seen_at'];
    const rows = subscribers.map((subscriber) => {
      const current = subscriber.enrollments[0];
      return [
        subscriber.id,
        subscriber.username,
        subscriber.firstName,
        subscriber.lastName,
        subscriber.status,
        subscriber.source,
        subscriber.tags.map((item) => item.tag.name).join('; '),
        current?.scenario.name,
        current?.status,
        subscriber.firstSeenAt.toISOString(),
        subscriber.lastSeenAt.toISOString(),
      ].map(safeCsvValue).join(',');
    });
    await prisma.botEvent.create({
      data: {
        userId,
        botId,
        eventType: 'AUDIENCE_CSV_EXPORTED',
        idempotencyKey: `audience-export:${botId}:${randomUUID()}`,
        metadata: { rows: subscribers.length, status: filters.status ?? 'ALL', searchApplied: Boolean(filters.search?.trim()) },
      },
    });
    return {
      fileName: `${bot.username || 'telegram-bot'}-subscribers.csv`,
      csv: `\uFEFF${[header.map(safeCsvValue).join(','), ...rows].join('\r\n')}`,
      rows: subscribers.length,
    };
  },
};
