import { Request, Response, Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { env } from '../config/env';

// Keep brute-force protection, but allow normal retries/autofill corrections.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много refresh-запросов. Попробуйте позже.' },
});

const router = Router();

function requireGoogleLegalConsent(req: Request, res: Response, next: () => void) {
  if (req.query.legalConsent !== '1') {
    res.status(400).json({ error: 'Для продолжения необходимо принять условия документов.' });
    return;
  }
  res.cookie('legal_consent', '1', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });
  next();
}

// Configure Google Strategy (only if credentials provided)
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('Google не вернул email'));

        done(null, {
          id: profile.id,
          email,
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
        });
      },
    ),
  );
}

// email/password
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', refreshLimiter, authController.logout);
router.get('/me', requireAuth, authController.me);

// Email verification
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', requireAuth, authController.resendVerification);

// OAuth session handoff — called by frontend after OAuth redirect
router.get('/oauth/session', authController.oauthSession);

// Google OAuth
router.get(
  '/google',
  requireGoogleLegalConsent,
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  authController.googleCallback,
);

export default router;
