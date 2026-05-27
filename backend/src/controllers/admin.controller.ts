import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { authService } from '../services/auth.service';
import { creditLedgerService } from '../services/credit-ledger.service';
import { setRefreshCookie } from '../utils/auth-cookies';

const listSchema = z.object({
  q: z.string().optional(),
  plan: z.enum(['ALL', 'FREE', 'PRO', 'ANNUAL']).optional().default('ALL'),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'HIGH_COST']).optional().default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function usd(value: unknown): number {
  if (!value) return 0;
  return Number(value);
}

function rub(value: unknown): number {
  if (!value) return 0;
  return Number(value);
}

function marginPercent(revenue: number, costUsd: number): number {
  const costRub = costUsd * 100;
  if (revenue <= 0) return costUsd > 0 ? -100 : 0;
  return Math.round(((revenue - costRub) / revenue) * 100);
}

function projectHealth(project: {
  strategyCompletedAt: Date | null;
  utpData: unknown;
  products: { type: string }[];
  generatedTexts: { id: string }[];
  contentPlanItems: { id: string }[];
}): number {
  let score = 0;
  if (project.strategyCompletedAt) score += 25;
  if (project.utpData) score += 15;
  if (project.products.length > 0) score += 25;
  if (project.generatedTexts.length > 0) score += 20;
  if (project.contentPlanItems.length > 0) score += 15;
  return score;
}

const grantProSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
  plan:     z.enum(['PRO', 'ANNUAL']).default('PRO'),
  months:   z.number().int().min(1).max(24).default(1),
  paymentSource: z.enum(['TRIBUTE', 'MANUAL', 'PROMO']).default('MANUAL'),
  amount: z.number().min(0).max(1_000_000).optional().default(0),
  externalId: z.string().max(200).optional(),
  adminNote: z.string().max(1000).optional(),
});

const updateAccessSchema = z.object({
  role: z.enum(['ADMIN', 'USER']).optional(),
  plan: z.enum(['FREE', 'PRO', 'ANNUAL']).optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  paymentDate: z.string().datetime().nullable().optional(),
  paymentSource: z.enum(['TRIBUTE', 'MANUAL', 'PROMO']).optional(),
  paymentAmount: z.number().min(0).max(10_000_000).optional(),
  externalId: z.string().max(200).optional(),
  adminNote: z.string().max(2000).nullable().optional(),
  ltvRub: z.number().min(0).max(100_000_000).nullable().optional(),
  limitOverrides: z.object({
    monthlyCredits: z.number().int().min(0).max(1_000_000).optional(),
    projectLimit: z.number().int().min(0).max(1000).optional(),
    heavyGenerationLimit: z.number().int().min(0).max(100_000).optional(),
    chatDailyLimit: z.number().int().min(0).max(100_000).optional(),
    dailyGenerationLimit: z.number().int().min(0).max(100_000).optional(),
    monthlyGenerationLimit: z.number().int().min(0).max(1_000_000).optional(),
  }).nullable().optional(),
});

const addCreditsSchema = z.object({
  amount: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, 'amount не должен быть 0'),
  reason: z.string().max(500).optional(),
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

function formatSubscription(sub: {
  plan: string;
  status: string;
  expiresAt: Date | null;
  paymentSource?: string | null;
  lastPaymentAt?: Date | null;
  adminNote?: string | null;
  ltvRub?: unknown;
  limitOverrides?: unknown;
} | null) {
  if (!sub) return { plan: 'FREE', status: 'ACTIVE', expiresAt: null };
  if (sub.expiresAt && sub.expiresAt < new Date() && sub.status === 'ACTIVE') {
    return { plan: 'FREE', status: 'EXPIRED', expiresAt: sub.expiresAt };
  }
  return {
    plan: sub.plan,
    status: sub.status,
    expiresAt: sub.expiresAt,
    paymentSource: sub.paymentSource ?? null,
    lastPaymentAt: sub.lastPaymentAt ?? null,
    adminNote: sub.adminNote ?? null,
    ltvRub: sub.ltvRub ?? null,
    limitOverrides: sub.limitOverrides ?? null,
  };
}

export const adminController = {
  async dashboard(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        newUsers7d,
        newUsers30d,
        activePro,
        revenueAgg,
        aiTotal,
        aiToday,
        aiCostAgg,
        aiCostTodayAgg,
        tokensTodayAgg,
        generationsToday,
        activeUsers30d,
        projectsCount,
        recentEvents,
        aiByProvider,
        aiByStatus,
        costByFeature,
        costByModel,
        costByWorkflow,
        workflowRuns,
        workflowSteps,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        prisma.subscription.count({
          where: {
            status: 'ACTIVE',
            plan: { in: ['PRO', 'ANNUAL'] },
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
        }),
        prisma.payment.aggregate({
          where: { status: 'SUCCEEDED' },
          _sum: { amount: true },
        }),
        prisma.aIUsage.aggregate({ _sum: { count: true } }),
        prisma.aIUsage.aggregate({
          where: { date: startOfDay.toISOString().slice(0, 10) },
          _sum: { count: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { status: 'SUCCEEDED', createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { status: 'SUCCEEDED', createdAt: { gte: startOfDay } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { createdAt: { gte: startOfDay } },
          _sum: { totalTokens: true },
        }),
        prisma.aIGeneration.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.project.count(),
        prisma.userEvent.findMany({
          where: { type: { in: ['admin_user_created', 'admin_pro_granted', 'admin_impersonation_started'] } },
          orderBy: { createdAt: 'desc' },
          take: 12,
          include: { user: { select: { email: true, name: true } } },
        }),
        prisma.aIRequestLog.groupBy({
          by: ['provider'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.aIRequestLog.groupBy({
          by: ['status'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['featureCode'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
          orderBy: { _count: { featureCode: 'desc' } },
          take: 10,
        }),
        prisma.aIGeneration.groupBy({
          by: ['provider', 'model'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
          orderBy: { _count: { model: 'desc' } },
          take: 12,
        }),
        prisma.aIGeneration.groupBy({
          by: ['featureCode'],
          where: { createdAt: { gte: thirtyDaysAgo }, workflowRunId: { not: null } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _avg: { latencyMs: true },
          _count: { _all: true },
          orderBy: { _count: { featureCode: 'desc' } },
          take: 12,
        }),
        prisma.aIWorkflowRun.groupBy({
          by: ['workflow', 'status'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
          orderBy: { _count: { workflow: 'desc' } },
          take: 30,
        }),
        prisma.aIWorkflowStep.groupBy({
          by: ['step', 'status'],
          where: { createdAt: { gte: thirtyDaysAgo } },
          _avg: { latencyMs: true, retryCount: true },
          _count: { _all: true },
          orderBy: { _count: { step: 'desc' } },
          take: 30,
        }),
      ]);

      const revenue = Number(revenueAgg._sum.amount ?? 0);
      const aiCostUsd = usd(aiCostAgg._sum.actualCostUsd);
      const aiCostTodayUsd = usd(aiCostTodayAgg._sum.actualCostUsd);
      const activeUserCount = activeUsers30d.length;
      const avgCostPerUser = activeUserCount > 0 ? aiCostUsd / activeUserCount : 0;
      const avgCostPerProject = projectsCount > 0 ? aiCostUsd / projectsCount : 0;
      const topFeature = costByFeature[0]?.featureCode ?? '—';

      const workflowMap = new Map<string, {
        workflow: string;
        count: number;
        success: number;
        failed: number;
        avgDurationMs: number;
        avgRetry: number;
      }>();
      for (const run of workflowRuns) {
        const item = workflowMap.get(run.workflow) ?? { workflow: run.workflow, count: 0, success: 0, failed: 0, avgDurationMs: 0, avgRetry: 0 };
        item.count += run._count._all;
        if (run.status.includes('FAILED')) item.failed += run._count._all;
        else item.success += run._count._all;
        workflowMap.set(run.workflow, item);
      }
      for (const step of workflowSteps) {
        const workflow = step.step;
        const item = workflowMap.get(workflow) ?? { workflow, count: 0, success: 0, failed: 0, avgDurationMs: 0, avgRetry: 0 };
        item.avgDurationMs = Math.round(step._avg.latencyMs ?? 0);
        item.avgRetry = Number((step._avg.retryCount ?? 0).toFixed(2));
        workflowMap.set(workflow, item);
      }

      res.json({
        metrics: {
          totalUsers,
          newUsers7d,
          newUsers30d,
          activeUsers30d: activeUserCount,
          activePro,
          revenue,
          averageLtv: totalUsers > 0 ? revenue / totalUsers : 0,
          aiTotal: aiTotal._sum.count ?? 0,
          aiToday: aiToday._sum.count ?? 0,
          totalAiCostUsd: aiCostUsd,
          aiCostTodayUsd,
          avgAiCostPerUserUsd: avgCostPerUser,
          avgAiCostPerProjectUsd: avgCostPerProject,
          estimatedMarginRub: revenue - aiCostUsd * 100,
          estimatedMarginPercent: marginPercent(revenue, aiCostUsd),
          tokensToday: tokensTodayAgg._sum.totalTokens ?? 0,
          generationsToday,
          mostUsedFeature: topFeature,
        },
        ai: {
          byProvider: aiByProvider.map((item) => ({ provider: item.provider, count: item._count._all })),
          byStatus: aiByStatus.map((item) => ({ status: item.status, count: item._count._all })),
          byFeature: costByFeature.map((item) => ({
            featureCode: item.featureCode,
            requests: item._count._all,
            tokens: item._sum.totalTokens ?? 0,
            costUsd: usd(item._sum.actualCostUsd),
          })),
          byModel: costByModel.map((item) => ({
            provider: item.provider,
            model: item.model,
            requests: item._count._all,
            tokens: item._sum.totalTokens ?? 0,
            costUsd: usd(item._sum.actualCostUsd),
          })),
          byWorkflow: costByWorkflow.map((item) => ({
            workflow: item.featureCode,
            requests: item._count._all,
            tokens: item._sum.totalTokens ?? 0,
            costUsd: usd(item._sum.actualCostUsd),
            avgLatencyMs: Math.round(item._avg.latencyMs ?? 0),
          })),
          workflowHealth: Array.from(workflowMap.values()).map((item) => ({
            ...item,
            successRate: item.count > 0 ? Math.round((item.success / item.count) * 100) : 0,
          })),
        },
        recentEvents: recentEvents.map((event) => ({
          id: event.id,
          type: event.type,
          userId: event.userId,
          actorId: event.actorId,
          metadata: event.metadata,
          createdAt: event.createdAt,
          user: event.user,
        })),
      });
    } catch (err) {
      console.error('[Admin] dashboard:', err);
      res.status(500).json({ error: 'Ошибка загрузки метрик' });
    }
  },

  async listUsers(req: AuthRequest, res: Response): Promise<void> {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    const { q, plan, status, limit, offset } = parsed.data;

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
          events: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          _count: { select: { projects: true } },
          },
        }),
      ]);

      const userIds = users.map((user) => user.id);
      const [generationByUser, failedByUser, projectCounts] = await Promise.all([
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, status: 'FAILED' },
          _count: { _all: true },
        }),
        prisma.project.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, generatedTexts: { select: { id: true } } },
        }),
      ]);
      const genMap = new Map(generationByUser.map((item) => [item.userId, item]));
      const failedMap = new Map(failedByUser.map((item) => [item.userId, item._count._all]));
      const generatedTextMap = new Map<string, number>();
      for (const project of projectCounts) {
        generatedTextMap.set(project.userId, (generatedTextMap.get(project.userId) ?? 0) + project.generatedTexts.length);
      }

      let items = users.map((user) => {
        const gen = genMap.get(user.id);
        const ltv = user.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const aiCostUsd = usd(gen?._sum.actualCostUsd);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          subscription: formatSubscription(user.subscription),
          projectCount: user._count.projects,
          generatedTextCount: generatedTextMap.get(user.id) ?? 0,
          aiRequestCount: gen?._count._all ?? user.aiUsage.reduce((sum, item) => sum + item.count, 0),
          failedAiRequestCount: failedMap.get(user.id) ?? 0,
          tokens: gen?._sum.totalTokens ?? 0,
          aiCostUsd,
          ltv,
          marginPercent: marginPercent(ltv, aiCostUsd),
          lastActivityAt: user.events[0]?.createdAt ?? user.updatedAt,
          currentStage: user.projects[0] ? currentStage(user.projects[0]) : 'Нет проекта',
        };
      });

      if (status === 'ACTIVE') items = items.filter((item) => new Date(item.lastActivityAt).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (status === 'INACTIVE') items = items.filter((item) => new Date(item.lastActivityAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (status === 'HIGH_COST') items = items.filter((item) => item.aiCostUsd >= 3);

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
          aiRequestLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
          events: {
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
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

      const generationAgg = await prisma.aIGeneration.aggregate({
        where: { userId: user.id },
        _sum: { actualCostUsd: true, totalTokens: true, inputTokens: true, outputTokens: true },
        _avg: { totalTokens: true, actualCostUsd: true },
        _count: { _all: true },
      });
      const featureUsage = await prisma.aIGeneration.groupBy({
        by: ['featureCode'],
        where: { userId: user.id },
        _sum: { actualCostUsd: true, totalTokens: true },
        _count: { _all: true },
        orderBy: { _count: { featureCode: 'desc' } },
        take: 20,
      });
      const projectGeneration = await prisma.aIGeneration.groupBy({
        by: ['projectId'],
        where: { userId: user.id, projectId: { not: null } },
        _sum: { actualCostUsd: true, totalTokens: true },
        _count: { _all: true },
        orderBy: { _count: { projectId: 'desc' } },
        take: 50,
      });
      const projectGenerationMap = new Map(projectGeneration.map((item) => [item.projectId, item]));
      const ltv = user.payments
        .filter((payment) => payment.status === 'SUCCEEDED')
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const aiCostUsd = usd(generationAgg._sum.actualCostUsd);

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
          aiRequestLogs: user.aiRequestLogs.filter((log) => log.status !== 'success').slice(0, 10),
          events: user.events.filter((event) => !['ai_request_succeeded', 'strategy_saved', 'user_logged_in'].includes(event.type)),
          aiRequestCount: generationAgg._count._all,
          tokens: generationAgg._sum.totalTokens ?? 0,
          inputTokens: generationAgg._sum.inputTokens ?? 0,
          outputTokens: generationAgg._sum.outputTokens ?? 0,
          aiCostUsd,
          avgTokensPerRequest: Math.round(generationAgg._avg.totalTokens ?? 0),
          avgCostPerGenerationUsd: usd(generationAgg._avg.actualCostUsd),
          ltv,
          marginPercent: marginPercent(ltv, aiCostUsd),
          featureUsage: featureUsage.map((item) => ({
            featureCode: item.featureCode,
            requests: item._count._all,
            tokens: item._sum.totalTokens ?? 0,
            costUsd: usd(item._sum.actualCostUsd),
          })),
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
            health: projectHealth(project),
            aiRequests: projectGenerationMap.get(project.id)?._count._all ?? 0,
            aiTokens: projectGenerationMap.get(project.id)?._sum.totalTokens ?? 0,
            aiCostUsd: usd(projectGenerationMap.get(project.id)?._sum.actualCostUsd),
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

    const { email, name, password, plan, months, paymentSource, amount, externalId, adminNote } = parsed.data;
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
        await prisma.userEvent.create({
          data: {
            userId: user.id,
            actorId: req.userId!,
            type: 'admin_user_created',
            metadata: { email: user.email, plan },
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

      let payment = null;
      if (amount > 0) {
        payment = await prisma.payment.create({
          data: {
            userId: user.id,
            subscriptionId: subscription.id,
            amount,
            status: 'SUCCEEDED',
            source: paymentSource,
            externalId: externalId ?? null,
            adminNote: adminNote ?? null,
            metadata: {
              plan,
              months,
              createdBy: req.userId!,
            },
          },
        });
      }

      await prisma.userEvent.create({
        data: {
          userId: user.id,
          actorId: req.userId!,
          type: 'admin_pro_granted',
          metadata: {
            plan,
            months,
            expiresAt,
            paymentSource,
            amount,
            externalId,
            adminNote,
          } as Prisma.InputJsonValue,
        },
      });

      res.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
        subscription,
        payment,
      });
    } catch (err) {
      console.error('[Admin] grantPro:', err);
      res.status(500).json({ error: 'Ошибка выдачи PRO' });
    }
  },

  async updateUserAccess(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateAccessSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const target = await prisma.user.findUnique({ where: { id: req.params.id as string }, include: { subscription: true } });
      if (!target) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

      const data = parsed.data;
      if (data.role) {
        await prisma.user.update({ where: { id: target.id }, data: { role: data.role } });
      }

      const expiresAt = data.expiresAt === undefined ? target.subscription?.expiresAt ?? null : data.expiresAt ? new Date(data.expiresAt) : null;
      const lastPaymentAt = data.paymentDate === undefined ? target.subscription?.lastPaymentAt ?? null : data.paymentDate ? new Date(data.paymentDate) : null;
      const plan = data.plan ?? target.subscription?.plan ?? 'FREE';
      const status = data.status ?? target.subscription?.status ?? 'ACTIVE';

      const subscription = await prisma.subscription.upsert({
        where: { userId: target.id },
        create: {
          userId: target.id,
          plan,
          status,
          expiresAt,
          paymentSource: data.paymentSource ?? null,
          lastPaymentAt,
          adminNote: data.adminNote ?? null,
          ltvRub: data.ltvRub ?? null,
          limitOverrides: data.limitOverrides ? data.limitOverrides as Prisma.InputJsonValue : Prisma.JsonNull,
        },
        update: {
          plan,
          status,
          expiresAt,
          ...(data.paymentSource !== undefined ? { paymentSource: data.paymentSource } : {}),
          ...(data.paymentDate !== undefined ? { lastPaymentAt } : {}),
          ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
          ...(data.ltvRub !== undefined ? { ltvRub: data.ltvRub } : {}),
          ...(data.limitOverrides !== undefined ? { limitOverrides: data.limitOverrides ? data.limitOverrides as Prisma.InputJsonValue : Prisma.JsonNull } : {}),
        },
      });

      if ((data.paymentAmount ?? 0) > 0) {
        await prisma.payment.create({
          data: {
            userId: target.id,
            subscriptionId: subscription.id,
            amount: data.paymentAmount!,
            status: 'SUCCEEDED',
            source: data.paymentSource ?? 'MANUAL',
            externalId: data.externalId ?? null,
            adminNote: data.adminNote ?? null,
            createdAt: data.paymentDate ? new Date(data.paymentDate) : undefined,
            metadata: {
              plan,
              updatedBy: req.userId!,
              source: 'admin_access_update',
            },
          },
        });
      }

      await prisma.userEvent.create({
        data: {
          userId: target.id,
          actorId: req.userId!,
          type: 'admin_access_updated',
          metadata: data as Prisma.InputJsonValue,
        },
      });

      res.json({ ok: true, subscription });
    } catch (err) {
      console.error('[Admin] updateUserAccess:', err);
      res.status(500).json({ error: 'Ошибка обновления доступа' });
    }
  },

  async addUserCredits(req: AuthRequest, res: Response): Promise<void> {
    const parsed = addCreditsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const target = await prisma.user.findUnique({ where: { id: req.params.id as string }, select: { id: true } });
      if (!target) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

      const entry = await creditLedgerService.addEntry({
        userId: target.id,
        type: 'ADJUST',
        source: 'ADMIN',
        amount: parsed.data.amount,
        reason: parsed.data.reason ?? 'Admin credits override',
        metadata: { actorId: req.userId! },
      });

      await prisma.userEvent.create({
        data: {
          userId: target.id,
          actorId: req.userId!,
          type: 'admin_credits_adjusted',
          metadata: { amount: parsed.data.amount, reason: parsed.data.reason, balanceAfter: entry.balanceAfter } as Prisma.InputJsonValue,
        },
      });

      res.json({ ok: true, entry });
    } catch (err) {
      console.error('[Admin] addUserCredits:', err);
      const message = err instanceof Error ? err.message : 'Ошибка обновления credits';
      res.status(500).json({ error: message });
    }
  },

  async impersonateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id as string },
        select: { id: true, email: true, name: true, avatarUrl: true, role: true, isVerified: true },
      });

      if (!user) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }

      const tokens = await authService.issueTokens(user.id);
      const csrfToken = setRefreshCookie(res, tokens.refreshToken);
      await prisma.userEvent.create({
        data: {
          userId: user.id,
          actorId: req.userId!,
          type: 'admin_impersonation_started',
          metadata: { email: user.email } as Prisma.InputJsonValue,
        },
      });

      res.json({ user, tokens: { accessToken: tokens.accessToken, csrfToken } });
    } catch (err) {
      console.error('[Admin] impersonateUser:', err);
      res.status(500).json({ error: 'Ошибка входа под пользователем' });
    }
  },
};
