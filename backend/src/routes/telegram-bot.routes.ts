import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { telegramBotController } from '../controllers/telegram-bot.controller';
import { telegramBotAssetController } from '../controllers/telegram-bot-asset.controller';
import { telegramScenarioController } from '../controllers/telegram-scenario.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { TELEGRAM_ASSET_MAX_BYTES } from '../services/telegram-bot-asset.service';

const router = Router();
const assetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TELEGRAM_ASSET_MAX_BYTES } });
const uploadAsset = (req: Request, res: Response, next: NextFunction) => {
  assetUpload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'TELEGRAM_ASSET_TOO_LARGE', message: 'Файл превышает допустимый размер' });
      return;
    }
    if (error) return next(error);
    next();
  });
};
const assetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TELEGRAM_ASSET_RATE_LIMITED', message: 'Слишком много операций с файлами. Попробуйте позже.' },
});
const scenarioMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TELEGRAM_SCENARIO_RATE_LIMITED', message: 'Слишком много изменений сценария. Попробуйте позже.' },
});
const scenarioTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TELEGRAM_SCENARIO_TEST_RATE_LIMITED', message: 'Слишком много тестовых запусков. Попробуйте позже.' },
});

router.post('/webhooks/:publicBotKey', telegramBotController.webhookV2);
router.post('/webhook', telegramBotController.webhook);
router.post('/diagnose', requireAuth, telegramBotController.diagnose);
router.get('/', requireAuth, telegramBotController.list);
router.post('/', requireAuth, telegramBotController.create);
router.get('/:botId/assets', requireAuth, telegramBotAssetController.list);
router.post('/:botId/assets', requireAuth, assetLimiter, uploadAsset, telegramBotAssetController.upload);
router.get('/:botId/assets/:assetId', requireAuth, assetLimiter, telegramBotAssetController.download);
router.delete('/:botId/assets/:assetId', requireAuth, assetLimiter, telegramBotAssetController.remove);
router.get('/:botId/test-recipient', requireAuth, telegramScenarioController.testRecipientStatus);
router.post('/:botId/test-recipient-verifications', requireAuth, scenarioTestLimiter, telegramScenarioController.createTestRecipientVerification);
router.get('/:botId/scenarios', requireAuth, telegramScenarioController.list);
router.post('/:botId/scenarios', requireAuth, scenarioMutationLimiter, telegramScenarioController.create);
router.get('/:botId/scenarios/:scenarioId', requireAuth, telegramScenarioController.get);
router.patch('/:botId/scenarios/:scenarioId', requireAuth, scenarioMutationLimiter, telegramScenarioController.updateMetadata);
router.put('/:botId/scenarios/:scenarioId/draft', requireAuth, scenarioMutationLimiter, telegramScenarioController.updateDraft);
router.post('/:botId/scenarios/:scenarioId/versions', requireAuth, scenarioMutationLimiter, telegramScenarioController.createDraftVersion);
router.post('/:botId/scenarios/:scenarioId/publish', requireAuth, scenarioMutationLimiter, telegramScenarioController.publish);
router.post('/:botId/scenarios/:scenarioId/pause', requireAuth, scenarioMutationLimiter, telegramScenarioController.pause);
router.post('/:botId/scenarios/:scenarioId/rollback', requireAuth, scenarioMutationLimiter, telegramScenarioController.rollback);
router.post('/:botId/scenarios/:scenarioId/archive', requireAuth, scenarioMutationLimiter, telegramScenarioController.archive);
router.post('/:botId/scenarios/:scenarioId/test-runs', requireAuth, scenarioTestLimiter, telegramScenarioController.testRun);
router.get('/:botId', requireAuth, telegramBotController.get);
router.patch('/:botId', requireAuth, telegramBotController.update);
router.put('/:botId/token', requireAuth, telegramBotController.replaceToken);
router.get('/:botId/diagnostics', requireAuth, telegramBotController.botDiagnostics);
router.post('/:botId/webhook', requireAuth, telegramBotController.connectWebhook);
router.delete('/:botId/webhook', requireAuth, telegramBotController.disconnectWebhook);
router.delete('/:botId', requireAuth, telegramBotController.archive);

export default router;
