import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authService } from '../services/auth.service';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const token = header.slice(7);

  // Dev bypass: allow static token in development mode
  if (token === 'dev-token' && env.NODE_ENV === 'development') {
    req.userId = 'dev-user-001';
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub: string };
      req.userId = payload.sub;
    } catch {
      // ignore
    }
  }
  next();
}
