import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as os from 'os';
import { filesController } from '../controllers/files.controller';
import { requireAuth } from '../middleware/auth.middleware';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();

const filesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много загрузок файлов. Попробуйте позже.' },
});

router.post(
  '/extract-text',
  requireAuth,
  filesLimiter,
  upload.single('file'),
  filesController.extractText,
);

export default router;
