import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const listSchema = z.object({
  q: z.string().optional(),
  plan: z.enum(['ALL', 'FREE', 'PRO', 'ANNUAL']).optional().default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const grantProSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
  plan:     z.enum(['PRO', 'ANNUAL']).default('PRO'),
  months:   z.number().int().min(1).max(24).default(1),
});

function currentStage(project: {
  strategyCompletedAt: Date | null;
  strategyData: unknown;
  utpData: unknown;
  products: { type: string }[];
  contentPlanItems: { id: string }[];
  generatedTexts: { id: string }[];
}): string {
  const strategyData = project.strategyData as Record<string, unknown> | null;
  if (project.contentPlanItems.length > 0) return 'Контент-план';
  if (project.generatedTexts.length > 0) return 'Контент';
  if (project.products.some((p) => p.type === 'MAIN')) return 'Основной продукт';
  if (project.products.length > 0) return 'Продукты';
  if (project.utpData) return 'УТП';
  if (project.strategyCompletedAt) return 'Стратегия завершена';
  if (strategyData?.['answers'] || strategyData?.['unpackingData']) return 'Стратегия';
  return 'Старт';
}

function formatSubscription(sub: { plan: string; status: string; expiresAt: Date | null } | null) {
  if (!sub) return { plan: 'FREE', status: 'ACTIVE', expiresAt: null };
  if (sub.expiresAt && sub.expiresAt < new Date() && sub.status === 'ACTIVE') {
    return { plan: 'FREE', status: 'EXPIRED', expiresAt: sub.expiresAt };
  }
  return { plan: sub.plan, status: sub.status, expiresAt: sub.expiresAt };
}

export const adminController = {
  async listUsers(req: AuthRequest, res: Response): Promise<void> {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    const { q, plan, limit, offset } = parsed.data;

    try {
      const where: Prisma.UserWhereInput = {
        ...(q ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        } : {}),
        ...(plan !== 'ALL' ? { subscription: plan === 'FREE' ? null : { is: { plan } } } : {}),
      };

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            subscription: true,
            payments: { where: { status: 'SUCCEEDED' }, select: { amount: true } },
            projects: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              include: {
                products: { select: { type: true } },
                generatedTexts: { select: { id: true } },
                contentPlanItems: { select: { id: true } },
              },
            },
            aiUsage: { select: { count: true } },
            _count: { select: { projects: true } },
          },
        }),
      ]);

      const items = users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        subscription: formatSubscription(user.subscription),
        projectCount: user._count.projects,
        generatedTextCount: user.projects[0]?.generatedTexts.length ?? 0,
        aiRequestCount: user.aiUsage.reduce((sum, item) => sum + item.count, 0),
        ltv: user.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        currentStage: user.projects[0] ? currentStage(user.projects[0]) : 'Нет проекта',
      }));

      res.json({ users: items, total, limit, offset });
    } catch (err) {
      console.error('[Admin] listUsers:', err);
      res.status(500).json({ error: 'Ошибка загрузки пользователей' });
    }
  },

  async getUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id as string },
        include: {
          subscription: true,
          payments: { orderBy: { createdAt: 'desc' } },
          aiUsage: { orderBy: { date: 'desc' }, take: 30 },
          projects: {
            orderBy: { updatedAt: 'desc' },
            include: {
              products: { select: { id: true, type: true, title: true, createdAt: true } },
              generatedTexts: { select: { id: true, type: true, title: true, createdAt: true } },
              contentPlanItems: { select: { id: true, title: true, status: true, date: true } },
            },
          },
        },
      });

      if (!user) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.isVerified,
          specialization: user.specialization,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          subscription: formatSubscription(user.subscription),
          payments: user.payments,
          aiUsage: user.aiUsage,
          aiRequestCount: user.aiUsage.reduce((sum, item) => sum + item.count, 0),
          ltv: user.payments
            .filter((payment) => payment.status === 'SUCCEEDED')
            .reduce((sum, payment) => sum + Number(payment.amount), 0),
          projectCount: user.projects.length,
          generatedTextCount: user.projects.reduce((sum, project) => sum + project.generatedTexts.length, 0),
          currentStage: user.projects[0] ? currentStage(user.projects[0]) : 'Нет проекта',
          projects: user.projects.map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            currentStage: currentStage(project),
            productsCount: project.products.length,
            generatedTextsCount: project.generatedTexts.length,
            contentPlanItemsCount: project.contentPlanItems.length,
            products: project.products,
            generatedTexts: project.generatedTexts,
            contentPlanItems: project.contentPlanItems,
          })),
        },
      });
    } catch (err) {
      console.error('[Admin] getUser:', err);
      res.status(500).json({ error: 'Ошибка загрузки пользователя' });
    }
  },

  async grantPro(req: AuthRequest, res: Response): Promise<void> {
    const parsed = grantProSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    const { email, name, password, plan, months } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    try {
      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user) {
        if (!password) {
          res.status(404).json({ error: 'Пользователь не найден. Укажите пароль, чтобы создать пилотный аккаунт.' });
          return;
        }

        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: name ?? null,
            passwordHash: await bcrypt.hash(password, 12),
            isVerified: true,
          },
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
        subscription,
      });
    } catch (err) {
      console.error('[Admin] grantPro:', err);
      res.status(500).json({ error: 'Ошибка выдачи PRO' });
    }
  },
};
