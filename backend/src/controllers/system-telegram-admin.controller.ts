import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { systemTelegramAdminService } from '../services/system-telegram-admin.service';

export const systemTelegramAdminController = {
  async snapshot(_req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await systemTelegramAdminService.snapshot());
    } catch (error) {
      console.error('[Admin] system Telegram snapshot failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ error: 'SYSTEM_TELEGRAM_SNAPSHOT_FAILED' });
    }
  },
};
