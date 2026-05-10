import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from './auth.middleware';

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Доступ только для администратора' });
      return;
    }

    next();
  } catch (err) {
    console.error('[Admin] guard:', err);
    res.status(500).json({ error: 'Ошибка проверки прав администратора' });
  }
}
