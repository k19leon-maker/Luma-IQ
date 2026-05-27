import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminController } from '../controllers/admin.controller';

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов в админке. Попробуйте позже.' },
});

router.use(requireAuth, requireAdmin);
router.use(adminLimiter);

router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/grant-pro', adminController.grantPro);
router.patch('/users/:id/access', adminController.updateUserAccess);
router.post('/users/:id/credits', adminController.addUserCredits);
router.post('/users/:id/impersonate', adminController.impersonateUser);

export default router;
