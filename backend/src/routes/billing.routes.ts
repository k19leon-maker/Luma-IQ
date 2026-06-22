import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/plans', billingController.plans);
router.get('/me', requireAuth, billingController.me);

export default router;
