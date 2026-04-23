import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/me',              requireAuth, usersController.getMe);
router.patch('/me',            requireAuth, usersController.updateMe);
router.post('/me/password',    requireAuth, usersController.changePassword);
router.delete('/me',           requireAuth, usersController.deleteMe);

export default router;
