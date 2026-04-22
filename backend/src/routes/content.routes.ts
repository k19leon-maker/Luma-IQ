import { Router } from 'express';
import { contentController } from '../controllers/content.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/',      requireAuth, contentController.list);
router.post('/',     requireAuth, contentController.create);
router.patch('/:id', requireAuth, contentController.update);
router.delete('/:id',requireAuth, contentController.remove);

export default router;
