import { Router } from 'express';
import { jtbdController } from '../controllers/jtbd.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/steps',           requireAuth, jtbdController.getSteps);
router.post('/generate',       requireAuth, jtbdController.generate);
router.post('/save',           requireAuth, jtbdController.save);
router.get('/:projectId',      requireAuth, jtbdController.getByProject);

export default router;
