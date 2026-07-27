import { Router } from 'express';
import { telegramBotController } from '../controllers/telegram-bot.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/webhook', telegramBotController.webhook);
router.post('/diagnose', requireAuth, telegramBotController.diagnose);

export default router;
