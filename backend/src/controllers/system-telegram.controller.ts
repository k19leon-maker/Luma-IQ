import { Request, Response } from 'express';
import { z } from 'zod';
import { safeTelegramErrorMessage } from '../services/telegram-secret.service';
import {
  SystemTelegramWebhookError,
  SystemTelegramUpdate,
  systemTelegramWebhookService,
} from '../services/system-telegram-webhook.service';

const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
}).passthrough();

export const systemTelegramController = {
  async webhook(req: Request, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_SYSTEM_TELEGRAM_UPDATE' });
      return;
    }

    try {
      const result = await systemTelegramWebhookService.ingest({
        receivedSecret: req.header('x-telegram-bot-api-secret-token') ?? '',
        update: parsed.data as SystemTelegramUpdate,
      });
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof SystemTelegramWebhookError) {
        res.status(error.status).json({ error: error.code });
        return;
      }
      console.error('[SystemTelegram] ingest failed', {
        updateId: parsed.data.update_id,
        message: safeTelegramErrorMessage(error),
      });
      res.status(500).json({ error: 'SYSTEM_TELEGRAM_INGEST_FAILED' });
    }
  },
};
