import { Router } from 'express';
import { artifactController } from '../controllers/artifact.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', artifactController.list);
router.get('/:id', artifactController.get);
router.post('/:id/duplicate', artifactController.duplicate);
router.post('/:id/restore', artifactController.restore);
router.post('/:id/regenerate', artifactController.regenerate);

export default router;
