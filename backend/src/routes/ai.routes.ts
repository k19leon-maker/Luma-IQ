import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiController } from '../controllers/ai.controller';
import { aiWorkflowController } from '../controllers/ai-workflow.controller';
import { aiBatchController } from '../controllers/ai-batch.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// 20 запросов в минуту на пользователя
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к AI. Подождите минуту и попробуйте снова.' },
});

const router = Router();

router.post('/chat', requireAuth, aiLimiter, aiController.chat);
router.post('/about-summary', requireAuth, aiLimiter, aiController.aboutSummary);
router.post('/batches', requireAuth, aiLimiter, aiBatchController.create);
router.get('/batches', requireAuth, aiBatchController.list);
router.get('/batches/:id', requireAuth, aiBatchController.get);
router.post('/batches/:id/refresh', requireAuth, aiBatchController.refresh);
router.post('/batches/:id/cancel', requireAuth, aiBatchController.cancel);
router.get('/workflows/prompts', requireAuth, aiWorkflowController.listPrompts);
router.post('/workflows/:workflow/quote', requireAuth, aiWorkflowController.quote);
router.post('/workflows/:workflow/start', requireAuth, aiLimiter, aiWorkflowController.start);
router.post('/workflows/:workflow/step', requireAuth, aiLimiter, aiWorkflowController.step);
router.post('/workflows/:workflow/cancel', requireAuth, aiWorkflowController.cancel);

export default router;
