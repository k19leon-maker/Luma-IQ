import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { authService } from '../services/auth.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

const registerSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов'),
  name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(1, 'Введите пароль'),
});

function handleError(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status ?? 500;
    res.status(status).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
      const { email, password, name } = parsed.data;
      const result = await authService.register(email, password, name);
      res.status(201).json(result);
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
      const { email, password } = parsed.data;
      const result = await authService.login(email, password);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken обязателен' });
      return;
    }

    try {
      const result = await authService.refresh(refreshToken);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken).catch(() => {});
    }
    res.json({ message: 'Выход выполнен' });
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

      // Set tokens as httpOnly cookies — no tokens in URL
      res.cookie('oauth_access', result.tokens.accessToken, {
        ...COOKIE_OPTS,
        maxAge: 5 * 60 * 1000, // 5 minutes — one-time handoff
      });
      res.cookie('oauth_refresh', result.tokens.refreshToken, {
        ...COOKIE_OPTS,
        maxAge: 5 * 60 * 1000,
      });

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

      res.json({ user, tokens: { accessToken, refreshToken } });
    } catch {
      res.clearCookie('oauth_access',  COOKIE_OPTS);
      res.clearCookie('oauth_refresh', COOKIE_OPTS);
      res.status(401).json({ error: 'OAuth токен недействителен' });
    }
  },
};
