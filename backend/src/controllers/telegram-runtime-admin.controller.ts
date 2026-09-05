import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  TelegramRuntimeAdminError,
  telegramRuntimeAdminService,
} from '../services/telegram-runtime-admin.service';

const paramsSchema = z.object({
  queue: z.enum(['inbound', 'delivery']),
  id: z.string().uuid(),
});

const bodySchema = z.object({
  confirm: z.literal(true),
}).strict();

export const telegramRuntimeAdminController = {
  async recoverJob(req: AuthRequest, res: Response): Promise<void> {
    const params = paramsSchema.safeParse(req.params);
    const body = bodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: 'Укажите корректные queue, id и confirm=true',
        code: 'INVALID_RECOVERY_REQUEST',
      });
      return;
    }

    try {
      const result = await telegramRuntimeAdminService.recoverJob(
        params.data.queue,
        params.data.id,
        req.userId!,
      );
      res.json({ ok: true, job: result });
    } catch (error) {
      if (error instanceof TelegramRuntimeAdminError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      console.error('[Admin] recoverTelegramRuntimeJob:', error);
      res.status(500).json({ error: 'Ошибка восстановления Telegram-задания' });
    }
  },
};
