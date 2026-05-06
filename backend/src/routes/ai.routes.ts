import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// 30 запросов в минуту на пользователя
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к AI. Подождите минуту и попробуйте снова.' },
});

const router = Router();

router.post('/chat', requireAuth, aiLimiter, aiController.chat);

export default router;
