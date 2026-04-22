import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/',                       requireAuth, projectController.list);
router.post('/',                      requireAuth, projectController.create);
router.get('/:id',                    requireAuth, projectController.get);
router.patch('/:id',                  requireAuth, projectController.update);
router.delete('/:id',                 requireAuth, projectController.delete);
router.post('/:id/complete-strategy', requireAuth, projectController.completeStrategy);

export default router;
