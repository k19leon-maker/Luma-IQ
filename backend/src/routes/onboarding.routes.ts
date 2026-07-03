import { Router } from 'express';
import { onboardingController } from '../controllers/onboarding.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, onboardingController.state);
router.patch('/progress', requireAuth, onboardingController.progress);
router.post('/skip', requireAuth, onboardingController.skip);
router.post('/complete', requireAuth, onboardingController.complete);
router.post('/event', requireAuth, onboardingController.event);

export default router;
