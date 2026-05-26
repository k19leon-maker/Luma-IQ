import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminController } from '../controllers/admin.controller';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/grant-pro', adminController.grantPro);
router.patch('/users/:id/access', adminController.updateUserAccess);
router.post('/users/:id/credits', adminController.addUserCredits);
router.post('/users/:id/impersonate', adminController.impersonateUser);

export default router;
