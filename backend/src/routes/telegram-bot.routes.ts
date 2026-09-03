import { Router } from 'express';
import { telegramBotController } from '../controllers/telegram-bot.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/webhooks/:publicBotKey', telegramBotController.webhookV2);
router.post('/webhook', telegramBotController.webhook);
router.post('/diagnose', requireAuth, telegramBotController.diagnose);
router.get('/', requireAuth, telegramBotController.list);
router.post('/', requireAuth, telegramBotController.create);
router.get('/:botId', requireAuth, telegramBotController.get);
router.patch('/:botId', requireAuth, telegramBotController.update);
router.put('/:botId/token', requireAuth, telegramBotController.replaceToken);
router.get('/:botId/diagnostics', requireAuth, telegramBotController.botDiagnostics);
router.post('/:botId/webhook', requireAuth, telegramBotController.connectWebhook);
router.delete('/:botId/webhook', requireAuth, telegramBotController.disconnectWebhook);
router.delete('/:botId', requireAuth, telegramBotController.archive);

export default router;
