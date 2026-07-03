import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/create', requireAuth, paymentController.createPayment);
router.post('/create-start-test-20', requireAuth, paymentController.createStartTestPayment);
router.get('/subscription', requireAuth, paymentController.getSubscription);
router.post('/webhook', paymentController.webhook);

export default router;
