import { Response } from 'express';
import { z } from 'zod';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { TelegramBotApiError, telegramBotService } from '../services/telegram-bot.service';

const diagnoseSchema = z.object({
  token: z.string()
    .trim()
    .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,}$/, 'Некорректный формат токена Telegram-бота'),
});

const webhookUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
}).passthrough();

function safeSecretEqual(received: string, expected: string): boolean {
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function updateKind(update: Record<string, unknown>): string {
  return [
    'message',
    'edited_message',
    'channel_post',
    'edited_channel_post',
    'callback_query',
    'inline_query',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ].find((key) => key in update) ?? 'unknown';
}

export const telegramBotController = {
  async webhook(req: AuthRequest, res: Response): Promise<void> {
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(503).json({ error: 'TELEGRAM_WEBHOOK_NOT_CONFIGURED' });
      return;
    }

    const receivedSecret = req.header('x-telegram-bot-api-secret-token') ?? '';
    if (!receivedSecret || !safeSecretEqual(receivedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      res.status(401).json({ error: 'INVALID_TELEGRAM_WEBHOOK_SECRET' });
      return;
    }

    const parsed = webhookUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_UPDATE' });
      return;
    }

    console.log('[TelegramWebhook] update received', {
      updateId: parsed.data.update_id,
      kind: updateKind(parsed.data),
    });
    res.sendStatus(200);
  },

  async diagnose(req: AuthRequest, res: Response): Promise<void> {
    const parsed = diagnoseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_TELEGRAM_BOT_TOKEN_FORMAT',
        message: parsed.error.errors[0]?.message ?? 'Некорректный токен Telegram-бота',
      });
      return;
    }

    try {
      const diagnostics = await telegramBotService.diagnose(parsed.data.token);
      res.json({ diagnostics });
    } catch (error) {
      if (error instanceof TelegramBotApiError) {
        res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'TELEGRAM_DIAGNOSTICS_FAILED',
        message: 'Не удалось проверить Telegram-бота',
      });
    }
  },
};
