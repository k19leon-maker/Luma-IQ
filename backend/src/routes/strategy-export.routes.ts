import { Router } from 'express';
import { exportStrategyPdf } from '../controllers/strategy-export.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.post('/export-pdf', requireAuth, exportStrategyPdf);
export default router;
