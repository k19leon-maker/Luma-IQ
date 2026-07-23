import { Router } from 'express';
import { castDevController } from '../controllers/castdev.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, castDevController.list);
router.post('/', requireAuth, castDevController.create);
router.post('/:id/transcribe', requireAuth, castDevController.transcribe);
router.post('/:id/analyze', requireAuth, castDevController.analyze);
router.patch('/:id', requireAuth, castDevController.update);
router.delete('/:id', requireAuth, castDevController.remove);

export default router;
