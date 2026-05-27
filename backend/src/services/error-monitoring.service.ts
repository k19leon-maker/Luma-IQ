import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

export const errorMonitoringService = {
  async captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    if (env.isProd) {
      console.error('[ErrorMonitor]', message, context);
    }

    await prisma.userEvent.create({
      data: {
        userId: typeof context?.userId === 'string' ? context.userId : null,
        type: 'server_error',
        metadata: {
          message,
          stack: stack?.slice(0, 4000),
          context,
        } as Prisma.InputJsonValue,
      },
    }).catch(() => {});
  },
};
