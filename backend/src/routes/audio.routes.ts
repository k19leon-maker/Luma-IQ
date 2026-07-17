import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as os from 'os';
import { audioController } from '../controllers/audio.controller';
import { requireAuth } from '../middleware/auth.middleware';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const audioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много голосовых сообщений. Попробуйте позже.' },
});

const router = Router();

router.post(
  '/transcribe',
  requireAuth,
  audioLimiter,
  upload.single('file'),
  audioController.transcribe,
);

export default router;
