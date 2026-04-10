import { Router } from 'express';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/chat', requireAuth, aiController.chat);

export default router;
