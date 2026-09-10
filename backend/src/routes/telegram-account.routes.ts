import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { telegramAccountController } from '../controllers/telegram-account.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TELEGRAM_LINK_RATE_LIMITED', message: 'Слишком много попыток привязки. Попробуйте позже.' },
});

router.get('/', requireAuth, telegramAccountController.get);
router.post('/link', requireAuth, linkLimiter, telegramAccountController.link);
router.delete('/', requireAuth, telegramAccountController.revoke);

export default router;
