import { Router } from 'express';
import { contentPlanController } from '../controllers/content-plan.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/',       requireAuth, contentPlanController.list);
router.post('/',      requireAuth, contentPlanController.create);
router.patch('/:id',  requireAuth, contentPlanController.update);
router.delete('/:id', requireAuth, contentPlanController.remove);

export default router;
