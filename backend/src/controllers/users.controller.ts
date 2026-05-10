import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';

const updateProfileSchema = z.object({
  name:           z.string().min(1).max(100).optional(),
  avatarColor:    z.string().max(20).optional(),
  defaultAiModel: z.string().max(50).optional(),
  specialization: z.string().max(200).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, 'Пароль должен быть не менее 8 символов'),
});

const manualProSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
  plan:     z.enum(['PRO', 'ANNUAL']).default('PRO'),
  months:   z.number().int().min(1).max(24).default(1),
  makeAdmin: z.boolean().optional().default(false),
});

function requireManualAdmin(req: Request, res: Response): boolean {
  if (!env.MANUAL_ADMIN_SECRET) {
    res.status(503).json({ error: 'Ручная активация не настроена' });
    return false;
  }

  if (req.header('x-admin-secret') !== env.MANUAL_ADMIN_SECRET) {
    res.status(403).json({ error: 'Доступ запрещён' });
    return false;
  }

  return true;
}

export const usersController = {
  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: {
          id: true, email: true, name: true, avatarUrl: true,
          avatarColor: true, defaultAiModel: true, specialization: true, role: true, isVerified: true,
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
          avatarColor: true, defaultAiModel: true, specialization: true, role: true, isVerified: true,
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

  async manualPro(req: Request, res: Response): Promise<void> {
    if (!requireManualAdmin(req, res)) return;

    const parsed = manualProSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { email, name, password, plan, months, makeAdmin } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    try {
      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user) {
        if (!password) {
          res.status(404).json({ error: 'Пользователь не найден. Передайте password, чтобы создать пилотный аккаунт.' });
          return;
        }

        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: name ?? null,
            passwordHash: await bcrypt.hash(password, 12),
            isVerified: true,
            role: makeAdmin ? 'ADMIN' : 'USER',
          },
        });
      } else if (makeAdmin && user.role !== 'ADMIN') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' },
        });
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);

      const subscription = await prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, plan, status: 'ACTIVE', expiresAt },
        update: { plan, status: 'ACTIVE', expiresAt },
      });

      res.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
        },
      });
    } catch (err) {
      console.error('[Users] manualPro:', err);
      res.status(500).json({ error: 'Ошибка при ручной активации PRO' });
    }
  },
};
