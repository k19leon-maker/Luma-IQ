import { Router } from 'express';
import { tasksController } from '../controllers/tasks.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, tasksController.list);
router.post('/', requireAuth, tasksController.create);
router.patch('/:id', requireAuth, tasksController.update);

export default router;
