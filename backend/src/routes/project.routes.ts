import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { instagramPackagingController } from '../controllers/instagram-packaging.controller';
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
router.get('/:id/utp/foundation',     requireAuth, projectController.getUtpFoundation);
router.get('/:id/utp/workspace',      requireAuth, projectController.getUtpWorkspace);
router.put('/:id/utp/workspace',      requireAuth, projectController.saveUtpWorkspace);
router.patch('/:id/utp',              requireAuth, projectController.saveUtpData);
router.get('/:id/instagram-packaging', requireAuth, instagramPackagingController.get);
router.put('/:id/instagram-packaging', requireAuth, instagramPackagingController.save);

export default router;
