import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { TelegramAccountError, telegramAccountService } from '../services/telegram-account.service';

const linkSchema = z.object({
  token: z.string().trim().min(32).max(128),
}).strict();

function fail(res: Response, error: unknown): void {
  if (error instanceof TelegramAccountError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error('[TelegramAccount] request failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({ error: 'TELEGRAM_ACCOUNT_REQUEST_FAILED', message: 'Не удалось выполнить операцию с Telegram' });
}

export const telegramAccountController = {
  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const telegramAccount = await telegramAccountService.getForUser(req.userId!);
      res.json({ telegramAccount });
    } catch (error) {
      fail(res, error);
    }
  },

  async link(req: AuthRequest, res: Response): Promise<void> {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_LINK_TOKEN', message: 'Некорректный код привязки' });
      return;
    }
    try {
      const telegramAccount = await telegramAccountService.linkAuthenticatedUser(req.userId!, parsed.data.token);
      res.json({ telegramAccount });
    } catch (error) {
      fail(res, error);
    }
  },

  async revoke(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await telegramAccountService.revokeForUser(req.userId!));
    } catch (error) {
      fail(res, error);
    }
  },
};
