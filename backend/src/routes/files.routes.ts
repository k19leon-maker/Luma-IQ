import { Router } from 'express';
import multer from 'multer';
import * as os from 'os';
import { filesController } from '../controllers/files.controller';
import { requireAuth } from '../middleware/auth.middleware';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();

router.post(
  '/extract-text',
  requireAuth,
  upload.single('file'),
  filesController.extractText,
);

export default router;
