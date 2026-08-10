import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import os from 'os';
import { audioController } from '../controllers/audio.controller';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware';
import { requestIdFrom } from '../middleware/request-context.middleware';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

export function audioIpRateLimitKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function audioUserRateLimitKey(req: Request): string {
  return `user:${(req as AuthRequest).userId ?? 'anonymous'}`;
}

function rateLimitHandler(code: string, message: string) {
  return (_req: Request, res: Response): void => {
    res.status(429).json({ code, error: message, requestId: requestIdFrom(res) });
  };
}

const audioIpGuard = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: audioIpRateLimitKey,
  handler: rateLimitHandler(
    'AUDIO_IP_RATE_LIMITED',
    'С этого подключения отправлено слишком много голосовых сообщений. Попробуйте позже.',
  ),
});

const audioUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: audioUserRateLimitKey,
  handler: rateLimitHandler(
    'AUDIO_RATE_LIMITED',
    'Слишком много голосовых сообщений. Попробуйте позже.',
  ),
});

function uploadAudio(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        code: 'AUDIO_FILE_TOO_LARGE',
        error: 'Аудиофайл слишком большой',
        requestId: requestIdFrom(res),
      });
      return;
    }
    res.status(400).json({
      code: 'AUDIO_UPLOAD_FAILED',
      error: 'Не удалось загрузить аудиофайл',
      requestId: requestIdFrom(res),
    });
  });
}

const router = Router();

router.post(
  '/transcribe',
  audioIpGuard,
  requireAuth,
  audioUserLimiter,
  uploadAudio,
  audioController.transcribe,
);

export default router;
