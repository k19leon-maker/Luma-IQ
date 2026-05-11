import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const eventService = {
  async track(type: string, opts: { userId?: string | null; actorId?: string | null; metadata?: Record<string, unknown> } = {}): Promise<void> {
    await prisma.userEvent.create({
      data: {
        type,
        userId: opts.userId ?? null,
        actorId: opts.actorId ?? null,
        metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  },
};
