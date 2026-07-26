import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/',                       requireAuth, projectController.list);
router.post('/',                      requireAuth, projectController.create);
router.get('/:id',                    requireAuth, projectController.get);
router.patch('/:id',                  requireAuth, projectController.update);
router.patch('/:id/archive',          requireAuth, projectController.setArchived);
router.delete('/:id',                 requireAuth, projectController.delete);
router.post('/:id/complete-strategy', requireAuth, projectController.completeStrategy);
router.get('/:id/strategy',           requireAuth, projectController.getStrategyData);
router.patch('/:id/strategy',         requireAuth, projectController.saveStrategyData);
router.get('/:id/utp',                requireAuth, projectController.getUtpData);
router.patch('/:id/utp',              requireAuth, projectController.saveUtpData);

export default router;
