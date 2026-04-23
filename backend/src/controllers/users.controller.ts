import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const updateProfileSchema = z.object({
  name:           z.string().min(1).max(100).optional(),
  avatarColor:    z.string().max(20).optional(),
  defaultAiModel: z.string().max(50).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, 'Пароль должен быть не менее 8 символов'),
});

export const usersController = {
  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: {
          id: true, email: true, name: true, avatarUrl: true,
          avatarColor: true, defaultAiModel: true, role: true,
        },
      });
      if (!user) { res.status(404).json({ error: 'Пользователь не найден' }); return; }
      res.json({ user });
    } catch (err) {
      console.error('[Users] getMe:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  },

  async updateMe(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      const user = await prisma.user.update({
        where: { id: req.userId! },
        data: parsed.data,
        select: {
          id: true, email: true, name: true, avatarUrl: true,
          avatarColor: true, defaultAiModel: true, role: true,
        },
      });
      res.json({ user });
    } catch (err) {
      console.error('[Users] updateMe:', err);
      res.status(500).json({ error: 'Ошибка при обновлении профиля' });
    }
  },

  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      const user = await prisma.user.findUnique({ where: { id: req.userId! } });
      if (!user || !user.passwordHash) {
        res.status(400).json({ error: 'Смена пароля недоступна для этого аккаунта' });
        return;
      }
      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) { res.status(400).json({ error: 'Неверный текущий пароль' }); return; }
      const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
      await prisma.user.update({ where: { id: req.userId! }, data: { passwordHash: newHash } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Users] changePassword:', err);
      res.status(500).json({ error: 'Ошибка при смене пароля' });
    }
  },

  async deleteMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      await prisma.user.delete({ where: { id: req.userId! } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Users] deleteMe:', err);
      res.status(500).json({ error: 'Ошибка при удалении аккаунта' });
    }
  },
};
