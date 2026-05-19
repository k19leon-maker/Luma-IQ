import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import type { SubscriptionPlan, SubscriptionStatus, Role } from '@prisma/client';

export class AiAccessError extends Error {
  status: number;

  constructor(message: string, status = 402) {
    super(message);
    this.status = status;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const aiAccessService = {
  async consume(userId: string): Promise<void> {
    let user: {
      role: Role;
      subscription: {
        status: SubscriptionStatus;
        plan: SubscriptionPlan;
        expiresAt: Date | null;
      } | null;
    } | null;

    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          subscription: true,
        },
      });
    } catch (err) {
      if (env.isDev) {
        console.warn('[AI access] DB unavailable in dev, skipping usage limit:', (err as Error).message);
        return;
      }
      throw err;
    }

    if (user?.role === 'ADMIN') return;

    const subscription = user?.subscription ?? null;

    if (subscription?.status === 'ACTIVE' && subscription.expiresAt && subscription.expiresAt < new Date()) {
      await prisma.subscription.update({ where: { userId }, data: { status: 'EXPIRED' } });
    } else if (
      subscription?.status === 'ACTIVE' &&
      subscription.plan !== 'FREE' &&
      (!subscription.expiresAt || subscription.expiresAt >= new Date())
    ) {
      return;
    }

    const date = todayUtc();
    const usage = await prisma.aIUsage.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (usage.count > env.FREE_AI_DAILY_LIMIT) {
      throw new AiAccessError(
        `Лимит бесплатного тарифа исчерпан: ${env.FREE_AI_DAILY_LIMIT} AI-запросов в день. Активируйте PRO-доступ.`,
      );
    }
  },
};
