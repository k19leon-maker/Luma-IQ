import { Request, Response, NextFunction, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { checkoutController } from '../controllers/checkout.controller';
import { env } from '../config/env';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком много попыток оформления. Попробуйте через 15 минут.',
    code: 'CHECKOUT_RATE_LIMIT',
  },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком много попыток оплаты. Попробуйте через 15 минут.',
    code: 'CHECKOUT_PAYMENT_RATE_LIMIT',
  },
});

function requireAllowedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (!origin) {
    if (env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Недопустимый источник запроса', code: 'CHECKOUT_ORIGIN_INVALID' });
      return;
    }
    next();
    return;
  }
  const allowedOrigins = new Set([
    ...env.FRONTEND_URL.split(',').map((value) => value.trim()),
    'http://localhost:5173',
    'http://localhost:5174',
  ]);
  if (!allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Недопустимый источник запроса', code: 'CHECKOUT_ORIGIN_INVALID' });
    return;
  }
  next();
}

router.post('/intents', checkoutLimiter, requireAllowedOrigin, checkoutController.createIntent);
router.post(
  '/intents/:intentId/payment',
  paymentLimiter,
  requireAllowedOrigin,
  checkoutController.createPayment,
);

export default router;
