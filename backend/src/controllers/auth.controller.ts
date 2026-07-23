import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { authService } from '../services/auth.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import {
  assertAdminReturnCsrf,
  assertRefreshCsrf,
  clearAdminReturnCookie,
  clearRefreshCookie,
  getAdminReturnCookie,
  getRefreshCookie,
  setAdminReturnCookie,
  setRefreshCookie,
} from '../utils/auth-cookies';
import { legalConsentSchema, logConsent } from '../services/consent-log.service';
import { prisma } from '../lib/prisma';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

const registerSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов'),
  name: z.string().min(1).max(100).optional(),
  consents: legalConsentSchema,
});

const loginSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(1, 'Введите пароль'),
  consents: legalConsentSchema.optional(),
});

function handleError(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status ?? 500;
    res.status(status).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

function authPayload(result: Awaited<ReturnType<typeof authService.login>>, res: Response) {
  const csrfToken = setRefreshCookie(res, result.tokens.refreshToken);
  return {
    user: result.user,
    tokens: {
      accessToken: result.tokens.accessToken,
      csrfToken,
    },
  };
}

async function logConsentSafely(params: Parameters<typeof logConsent>[0]) {
  try {
    await logConsent(params);
  } catch (err) {
    console.warn('[Auth] Failed to log legal consent:', err instanceof Error ? err.message : err);
  }
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    if (!env.REGISTRATION_ENABLED) {
      res.status(403).json({ error: 'Регистрация временно закрыта. Обратитесь к администратору.' });
      return;
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const { email, password, name, consents } = parsed.data;
      const result = await authService.register(email, password, name);
      await logConsentSafely({ req, userId: result.user.id, email: result.user.email, consents, source: 'b2b_register' });
      res.status(201).json(authPayload(result, res));
    } catch (err) {
      handleError(res, err);
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const { email, password, consents } = parsed.data;
      const result = await authService.login(email, password);
      clearAdminReturnCookie(res);
      if (consents) {
        await logConsentSafely({ req, userId: result.user.id, email: result.user.email, consents, source: 'b2b_login' });
      }
      res.json(authPayload(result, res));
    } catch (err) {
      handleError(res, err);
    }
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken = getRefreshCookie(req);
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh-сессия не найдена' });
      return;
    }
    if (!assertRefreshCsrf(req, refreshToken)) {
      res.status(403).json({ error: 'CSRF token недействителен' });
      return;
    }

    try {
      const result = await authService.refresh(refreshToken);
      res.json(authPayload(result, res));
    } catch (err) {
      handleError(res, err);
    }
  },

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = getRefreshCookie(req);
    if (refreshToken) {
      if (!assertRefreshCsrf(req, refreshToken)) {
        res.status(403).json({ error: 'CSRF token недействителен' });
        return;
      }
      await authService.logout(refreshToken).catch(() => {});
    }
    clearRefreshCookie(res);
    clearAdminReturnCookie(res);
    res.json({ message: 'Выход выполнен' });
  },

  async impersonateUser(req: AuthRequest, res: Response): Promise<void> {
    if (!req.userId) {
      res.status(401).json({ error: 'Необходима авторизация' });
      return;
    }

    const adminRefreshToken = getRefreshCookie(req);
    if (!adminRefreshToken) {
      res.status(401).json({ error: 'Админская refresh-сессия не найдена' });
      return;
    }
    if (!assertRefreshCsrf(req, adminRefreshToken)) {
      res.status(403).json({ error: 'CSRF token недействителен' });
      return;
    }
    if (getAdminReturnCookie(req)) {
      res.status(409).json({ error: 'Вложенный вход под пользователем запрещён' });
      return;
    }

    try {
      const admin = await authService.getUserById(req.userId);
      if (!admin || admin.role !== 'ADMIN') {
        res.status(403).json({ error: 'Доступ только для администратора' });
        return;
      }

      const target = await prisma.user.findUnique({
        where: { id: req.params.id as string },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isVerified: true,
          archivedAt: true,
          onboardingStatus: true,
          onboardingStep: true,
          onboardingVersion: true,
          onboardingCompletedAt: true,
          onboardingData: true,
          recommendedRoute: true,
          createdProjectId: true,
        },
      });

      if (!target || target.archivedAt) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }
      if (target.id === admin.id) {
        res.status(400).json({ error: 'Нельзя войти под текущим администратором' });
        return;
      }

      const result = await authService.issueTokens(target.id);
      const csrfToken = setRefreshCookie(res, result.refreshToken);
      setAdminReturnCookie(res, adminRefreshToken);

      await prisma.userEvent.create({
        data: {
          userId: target.id,
          actorId: admin.id,
          type: 'admin_impersonation_started',
          metadata: { email: target.email } as Prisma.InputJsonValue,
        },
      });

      const user = await authService.getUserById(target.id);
      res.json({ user, tokens: { accessToken: result.accessToken, csrfToken } });
    } catch (err) {
      handleError(res, err);
    }
  },

  async restoreAdminImpersonation(req: Request, res: Response): Promise<void> {
    const adminRefreshToken = getAdminReturnCookie(req);
    if (!adminRefreshToken) {
      res.status(401).json({ error: 'Админская сессия для возврата не найдена' });
      return;
    }
    if (!assertAdminReturnCsrf(req, adminRefreshToken)) {
      res.status(403).json({ error: 'CSRF token возврата недействителен' });
      return;
    }

    const impersonatedRefreshToken = getRefreshCookie(req);
    try {
      if (impersonatedRefreshToken && impersonatedRefreshToken !== adminRefreshToken) {
        await authService.logout(impersonatedRefreshToken).catch(() => {});
      }

      const result = await authService.refresh(adminRefreshToken);
      if (result.user.role !== 'ADMIN') {
        clearAdminReturnCookie(res);
        res.status(403).json({ error: 'Сохранённая сессия не является админской' });
        return;
      }

      clearAdminReturnCookie(res);
      res.json(authPayload(result, res));
    } catch (err) {
      clearAdminReturnCookie(res);
      clearRefreshCookie(res);
      handleError(res, err);
    }
  },

  async me(req: AuthRequest, res: Response): Promise<void> {
    if (!req.userId) {
      res.status(401).json({ error: 'Необходима авторизация' });
      return;
    }

    try {
      const user = await authService.getUserById(req.userId);
      if (!user) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }
      res.json({ user });
    } catch (err) {
      handleError(res, err);
    }
  },

  // Google OAuth callback — called after passport strategy
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const profile = req.user as {
        id: string;
        email: string;
        name?: string;
        avatarUrl?: string;
      };

      const result = await authService.findOrCreateGoogleUser(profile);
      const legalConsentCookie = (req as Request & { cookies: Record<string, string> }).cookies?.legal_consent;
      if (legalConsentCookie === '1') {
        await logConsentSafely({
          req,
          userId: result.user.id,
          email: result.user.email,
          consents: {
            privacyAccepted: true,
            personalDataAccepted: true,
            offerAccepted: true,
            documentVersion: 'v1',
          },
          source: 'google_oauth',
        });
      }

      // Set tokens as httpOnly cookies — no tokens in URL
      res.cookie('oauth_access', result.tokens.accessToken, {
        ...COOKIE_OPTS,
        maxAge: 5 * 60 * 1000, // 5 minutes — one-time handoff
      });
      res.cookie('oauth_refresh', result.tokens.refreshToken, {
        ...COOKIE_OPTS,
        maxAge: 5 * 60 * 1000,
      });
      res.clearCookie('legal_consent', COOKIE_OPTS);

      res.redirect(`${env.FRONTEND_URL}/auth/callback`);
    } catch (err) {
      res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.query as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Токен обязателен' });
      return;
    }
    try {
      await authService.verifyEmail(token);
      res.json({ message: 'Email подтверждён' });
    } catch (err) {
      handleError(res, err);
    }
  },

  async resendVerification(req: AuthRequest, res: Response): Promise<void> {
    if (!req.userId) { res.status(401).json({ error: 'Необходима авторизация' }); return; }
    try {
      await authService.resendVerification(req.userId);
      res.json({ message: 'Письмо отправлено' });
    } catch (err) {
      handleError(res, err);
    }
  },

  // Called by AuthCallback.tsx after OAuth redirect — exchanges cookie for session
  async oauthSession(req: Request, res: Response): Promise<void> {
    const accessToken  = (req as Request & { cookies: Record<string, string> }).cookies?.oauth_access;
    const refreshToken = (req as Request & { cookies: Record<string, string> }).cookies?.oauth_refresh;

    if (!accessToken || !refreshToken) {
      res.status(401).json({ error: 'OAuth сессия не найдена или истекла' });
      return;
    }

    try {
      const payload = jwt.verify(accessToken, env.JWT_SECRET) as { sub: string };
      const user = await authService.getUserById(payload.sub);
      if (!user) {
        res.status(401).json({ error: 'Пользователь не найден' });
        return;
      }

      // Consume the one-time cookies
      res.clearCookie('oauth_access',  COOKIE_OPTS);
      res.clearCookie('oauth_refresh', COOKIE_OPTS);

      res.json({ user, tokens: { accessToken, csrfToken: setRefreshCookie(res, refreshToken) } });
    } catch {
      res.clearCookie('oauth_access',  COOKIE_OPTS);
      res.clearCookie('oauth_refresh', COOKIE_OPTS);
      res.status(401).json({ error: 'OAuth токен недействителен' });
    }
  },
};
