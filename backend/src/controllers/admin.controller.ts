import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { authService } from '../services/auth.service';
import { creditLedgerService } from '../services/credit-ledger.service';
import { promptRegistry } from '../prompts/registry';
import { promptCmsService } from '../services/prompt-cms.service';
import { isDemoProductText } from '../utils/demo-products';
import { getPlanBySubscriptionPlan, isValidPlanId, toSubscriptionPlan, type PlanId } from '../config/pricing-plans';
import { AI_ACTION_LABELS, AI_ACTION_SECTIONS, aiPointsForGeneration, featureCodeToAiAction } from '../config/ai-actions';

const subscriptionPlanValues = ['FREE', 'START', 'PRO', 'EXPERT', 'SUPPORT', 'MARKETING_PARTNER', 'IMPLEMENTATION', 'ANNUAL'] as const;
const commercialPlanValues = ['START', 'PRO', 'EXPERT', 'SUPPORT', 'MARKETING_PARTNER', 'IMPLEMENTATION'] as const;

const listSchema = z.object({
  q: z.string().optional(),
  plan: z.enum(['ALL', ...subscriptionPlanValues]).optional().default('ALL'),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'HIGH_COST']).optional().default('ALL'),
  archive: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional().default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const workflowListSchema = z.object({
  userId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  workflow: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(80).optional(),
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

function costRub(costUsd: number): number {
  return Math.round(costUsd * 100);
}

function avg(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

function planAiBudgetRub(plan: string): number {
  if (plan === 'FREE') return 0;
  return getPlanBySubscriptionPlan(plan).limits.aiCostBudgetRub;
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
  plan:     z.enum(commercialPlanValues).default('PRO'),
  months:   z.number().int().min(1).max(24).default(1),
  paymentSource: z.enum(['TRIBUTE', 'MANUAL', 'PROMO']).default('MANUAL'),
  amount: z.number().min(0).max(1_000_000).optional().default(0),
  externalId: z.string().max(200).optional(),
  adminNote: z.string().max(1000).optional(),
});

const updateAccessSchema = z.object({
  role: z.enum(['ADMIN', 'USER']).optional(),
  plan: z.enum(subscriptionPlanValues).optional(),
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

const updatePlanSchema = z.object({
  planId: z.string().refine(isValidPlanId, 'Неизвестный тариф'),
});

const archiveUserSchema = z.object({
  archived: z.boolean(),
  reason: z.string().max(1000).nullable().optional(),
});

const createPromptVersionSchema = z.object({
  workflow: z.string().min(1).max(120),
  step: z.string().min(1).max(80),
  versionLabel: z.string().min(1).max(80),
  model: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(100).max(50000).optional(),
  systemPrompt: z.string().max(60000).optional(),
  userPromptTemplate: z.string().max(60000).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional().default('DRAFT'),
  notes: z.string().max(2000).optional(),
});

const createPromptExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  workflow: z.string().min(1).max(120),
  step: z.string().min(1).max(80),
  status: z.enum(['DRAFT', 'RUNNING', 'PAUSED', 'FINISHED']).optional().default('DRAFT'),
  trafficPct: z.number().int().min(1).max(100).optional().default(100),
  variants: z.array(z.object({
    name: z.string().min(1).max(120),
    promptVersionId: z.string().uuid().nullable().optional(),
    trafficWeight: z.number().int().min(0).max(100).optional().default(50),
    isControl: z.boolean().optional().default(false),
  })).min(2).max(6),
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

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const adminController = {
  async dashboard(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const nonArchivedUser = { archivedAt: null };

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
        failedGenerations30d,
        missingPricingAlerts30d,
        highCostUsers30d,
        revenueByPlan,
        costsByPlanRaw,
        cohortUsers,
        activatedUsers,
        retainedUsers7d,
        retainedUsers30d,
        promptVersionsCount,
        runningPromptExperiments,
        userEconomyProfiles,
        aiEconomyGenerations,
      ] = await Promise.all([
        prisma.user.count({ where: nonArchivedUser }),
        prisma.user.count({ where: { ...nonArchivedUser, createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { ...nonArchivedUser, createdAt: { gte: thirtyDaysAgo } } }),
        prisma.subscription.count({
          where: {
            user: nonArchivedUser,
            status: 'ACTIVE',
            plan: { in: ['PRO', 'ANNUAL'] },
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
        }),
        prisma.payment.aggregate({
          where: { status: 'SUCCEEDED', user: nonArchivedUser },
          _sum: { amount: true },
        }),
        prisma.aIUsage.aggregate({ where: { user: nonArchivedUser }, _sum: { count: true } }),
        prisma.aIUsage.aggregate({
          where: { user: nonArchivedUser, date: startOfDay.toISOString().slice(0, 10) },
          _sum: { count: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { user: nonArchivedUser, status: 'SUCCEEDED', createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { user: nonArchivedUser, status: 'SUCCEEDED', createdAt: { gte: startOfDay } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.aggregate({
          where: { user: nonArchivedUser, createdAt: { gte: startOfDay } },
          _sum: { totalTokens: true },
        }),
        prisma.aIGeneration.count({ where: { user: nonArchivedUser, createdAt: { gte: startOfDay } } }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.project.count({ where: { user: nonArchivedUser } }),
        prisma.userEvent.findMany({
          where: {
            type: { in: ['admin_user_created', 'admin_pro_granted', 'admin_impersonation_started', 'admin_user_archived', 'admin_user_unarchived'] },
            OR: [{ userId: null }, { user: nonArchivedUser }],
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
          include: { user: { select: { email: true, name: true } } },
        }),
        prisma.aIRequestLog.groupBy({
          by: ['provider'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.aIRequestLog.groupBy({
          by: ['status'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['featureCode'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
          orderBy: { _count: { featureCode: 'desc' } },
          take: 10,
        }),
        prisma.aIGeneration.groupBy({
          by: ['provider', 'model'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _count: { _all: true },
          orderBy: { _count: { model: 'desc' } },
          take: 12,
        }),
        prisma.aIGeneration.groupBy({
          by: ['featureCode'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo }, workflowRunId: { not: null } },
          _sum: { actualCostUsd: true, totalTokens: true },
          _avg: { latencyMs: true },
          _count: { _all: true },
          orderBy: { _count: { featureCode: 'desc' } },
          take: 12,
        }),
        prisma.aIWorkflowRun.groupBy({
          by: ['workflow', 'status'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
          orderBy: { _count: { workflow: 'desc' } },
          take: 30,
        }),
        prisma.aIWorkflowStep.groupBy({
          by: ['step', 'status'],
          where: { workflowRun: { user: nonArchivedUser }, createdAt: { gte: thirtyDaysAgo } },
          _avg: { latencyMs: true, retryCount: true },
          _count: { _all: true },
          orderBy: { _count: { step: 'desc' } },
          take: 30,
        }),
        prisma.aIGeneration.count({
          where: { user: nonArchivedUser, status: 'FAILED', createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.aIUsageEvent.count({
          where: {
            user: nonArchivedUser,
            eventType: 'FAILED',
            metadata: { path: ['code'], equals: 'MODEL_PRICING_MISSING' },
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _sum: { actualCostUsd: true },
          having: { actualCostUsd: { _sum: { gte: 3 } } },
        }),
        prisma.subscription.groupBy({
          by: ['plan'],
          where: { user: nonArchivedUser },
          _sum: { ltvRub: true },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo }, status: 'SUCCEEDED' },
          _sum: { actualCostUsd: true },
        }),
        prisma.user.findMany({
          where: { ...nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          select: { id: true, createdAt: true },
        }),
        prisma.project.groupBy({
          by: ['userId'],
          where: {
            user: nonArchivedUser,
            OR: [
              { strategyCompletedAt: { not: null } },
              { generatedTexts: { some: {} } },
              { aiGenerations: { some: {} } },
            ],
          },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { user: nonArchivedUser, createdAt: { gte: sevenDaysAgo } },
          _count: { _all: true },
        }),
        prisma.aIGeneration.groupBy({
          by: ['userId'],
          where: { user: nonArchivedUser, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
        }),
        prisma.promptVersion.count(),
        prisma.promptExperiment.count({ where: { status: 'RUNNING' } }),
        prisma.user.findMany({
          where: nonArchivedUser,
          select: {
            id: true,
            email: true,
            name: true,
            subscription: { select: { plan: true } },
            payments: { where: { status: 'SUCCEEDED' }, select: { amount: true } },
          },
        }),
        prisma.aIGeneration.findMany({
          where: { user: nonArchivedUser, status: 'SUCCEEDED', createdAt: { gte: thirtyDaysAgo } },
          select: {
            userId: true,
            featureCode: true,
            metadata: true,
            actualCostUsd: true,
            totalTokens: true,
          },
        }),
      ]);

      const revenue = Number(revenueAgg._sum.amount ?? 0);
      const aiCostUsd = usd(aiCostAgg._sum.actualCostUsd);
      const aiCostTodayUsd = usd(aiCostTodayAgg._sum.actualCostUsd);
      const activeUserCount = activeUsers30d.length;
      const avgCostPerUser = activeUserCount > 0 ? aiCostUsd / activeUserCount : 0;
      const avgCostPerProject = projectsCount > 0 ? aiCostUsd / projectsCount : 0;
      const topFeature = costByFeature[0]?.featureCode ?? '—';
      const subscriptionByUser = await prisma.subscription.findMany({
        where: { user: nonArchivedUser },
        select: { userId: true, plan: true },
      });
      const planByUser = new Map(subscriptionByUser.map((item) => [item.userId, item.plan]));
      const costsByPlan = new Map<string, number>();
      for (const item of costsByPlanRaw) {
        const plan = planByUser.get(item.userId) ?? 'FREE';
        costsByPlan.set(plan, (costsByPlan.get(plan) ?? 0) + usd(item._sum.actualCostUsd));
      }
      const revenuePlanRows = revenueByPlan.map((item) => ({
        plan: item.plan,
        users: item._count._all,
        revenueRub: rub(item._sum.ltvRub),
        aiCostUsd: costsByPlan.get(item.plan) ?? 0,
        marginRub: rub(item._sum.ltvRub) - (costsByPlan.get(item.plan) ?? 0) * 100,
      }));
      if (costsByPlan.has('FREE') && !revenuePlanRows.some((item) => item.plan === 'FREE')) {
        revenuePlanRows.push({ plan: 'FREE', users: 0, revenueRub: 0, aiCostUsd: costsByPlan.get('FREE') ?? 0, marginRub: -(costsByPlan.get('FREE') ?? 0) * 100 });
      }
      const cohortCount = cohortUsers.length;
      const activatedSet = new Set(activatedUsers.map((item) => item.userId));
      const retained7Set = new Set(retainedUsers7d.map((item) => item.userId));
      const retained30Set = new Set(retainedUsers30d.map((item) => item.userId));
      const userProfileById = new Map(userEconomyProfiles.map((user) => [user.id, user]));
      const userEconomyMap = new Map<string, {
        userId: string;
        email: string;
        name: string | null;
        plan: string;
        revenueRub: number;
        requests: number;
        tokens: number;
        aiPointsUsed: number;
        aiCostUsd: number;
      }>();
      const actionEconomyMap = new Map<string, {
        actionType: string;
        actionLabel: string;
        sectionLabel: string;
        requests: number;
        tokens: number;
        aiPoints: number;
        costUsd: number;
      }>();
      for (const generation of aiEconomyGenerations) {
        const profile = userProfileById.get(generation.userId);
        const actionType = featureCodeToAiAction(generation.featureCode);
        const points = aiPointsForGeneration(generation.featureCode, generation.metadata);
        const tokens = generation.totalTokens ?? 0;
        const costUsdValue = usd(generation.actualCostUsd);
        const userRow = userEconomyMap.get(generation.userId) ?? {
          userId: generation.userId,
          email: profile?.email ?? 'unknown',
          name: profile?.name ?? null,
          plan: profile?.subscription?.plan ?? 'FREE',
          revenueRub: profile?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0,
          requests: 0,
          tokens: 0,
          aiPointsUsed: 0,
          aiCostUsd: 0,
        };
        userRow.requests += 1;
        userRow.tokens += tokens;
        userRow.aiPointsUsed += points;
        userRow.aiCostUsd += costUsdValue;
        userEconomyMap.set(generation.userId, userRow);

        const actionRow = actionEconomyMap.get(actionType) ?? {
          actionType,
          actionLabel: AI_ACTION_LABELS[actionType],
          sectionLabel: AI_ACTION_SECTIONS[actionType],
          requests: 0,
          tokens: 0,
          aiPoints: 0,
          costUsd: 0,
        };
        actionRow.requests += 1;
        actionRow.tokens += tokens;
        actionRow.aiPoints += points;
        actionRow.costUsd += costUsdValue;
        actionEconomyMap.set(actionType, actionRow);
      }

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
          failedGenerations30d,
          missingPricingAlerts30d,
          highCostUsers30d: highCostUsers30d.length,
          mostUsedFeature: topFeature,
          promptVersionsCount,
          runningPromptExperiments,
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
          marginByPlan: revenuePlanRows.map((item) => ({
            ...item,
            aiCostRub: costRub(item.aiCostUsd),
            aiBudgetRub: planAiBudgetRub(item.plan) * item.users,
            aiBudgetUsedPercent: planAiBudgetRub(item.plan) * item.users > 0
              ? Math.round((costRub(item.aiCostUsd) / (planAiBudgetRub(item.plan) * item.users)) * 100)
              : 0,
            aiBudgetDeltaRub: planAiBudgetRub(item.plan) * item.users - costRub(item.aiCostUsd),
            marginPercent: marginPercent(item.revenueRub, item.aiCostUsd),
          })),
          userEconomics: Array.from(userEconomyMap.values())
            .map((item) => {
              const aiCostRub = costRub(item.aiCostUsd);
              const aiBudgetRub = planAiBudgetRub(item.plan);
              return {
                ...item,
                aiCostUsd: usd(item.aiCostUsd),
                aiCostRub,
                aiBudgetRub,
                aiBudgetUsedPercent: aiBudgetRub > 0 ? Math.round((aiCostRub / aiBudgetRub) * 100) : 0,
                aiBudgetDeltaRub: aiBudgetRub - aiCostRub,
                avgTokensPerRequest: Math.round(avg(item.tokens, item.requests)),
                avgCostUsd: usd(avg(item.aiCostUsd, item.requests)),
                avgCostRub: costRub(avg(item.aiCostUsd, item.requests)),
                avgAiPointsPerAction: Math.round(avg(item.aiPointsUsed, item.requests)),
              };
            })
            .sort((a, b) => b.aiBudgetUsedPercent - a.aiBudgetUsedPercent || b.aiCostRub - a.aiCostRub)
            .slice(0, 15),
          actionEconomics: Array.from(actionEconomyMap.values())
            .map((item) => ({
              ...item,
              costUsd: usd(item.costUsd),
              costRub: costRub(item.costUsd),
              avgTokensPerRequest: Math.round(avg(item.tokens, item.requests)),
              avgCostUsd: usd(avg(item.costUsd, item.requests)),
              avgCostRub: costRub(avg(item.costUsd, item.requests)),
              avgAiPoints: Math.round(avg(item.aiPoints, item.requests)),
            }))
            .sort((a, b) => b.costRub - a.costRub),
          promptExperiments: {
            versions: promptVersionsCount,
            running: runningPromptExperiments,
          },
        },
        retention: {
          cohort30dUsers: cohortCount,
          activatedUsers: activatedSet.size,
          activationRate: cohortCount > 0 ? Math.round((activatedSet.size / cohortCount) * 100) : 0,
          retained7dUsers: Array.from(activatedSet).filter((id) => retained7Set.has(id)).length,
          retained30dUsers: Array.from(activatedSet).filter((id) => retained30Set.has(id)).length,
          retention7dRate: activatedSet.size > 0 ? Math.round((Array.from(activatedSet).filter((id) => retained7Set.has(id)).length / activatedSet.size) * 100) : 0,
          retention30dRate: activatedSet.size > 0 ? Math.round((Array.from(activatedSet).filter((id) => retained30Set.has(id)).length / activatedSet.size) * 100) : 0,
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

  async listWorkflows(req: AuthRequest, res: Response): Promise<void> {
    const parsed = workflowListSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    const { userId, projectId, workflow, status, limit, offset } = parsed.data;
    const where: Prisma.AIWorkflowRunWhereInput = {
      user: { archivedAt: null },
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(workflow ? { workflow: { contains: workflow, mode: 'insensitive' } } : {}),
      ...(status ? { status } : {}),
    };

    try {
      const [total, runs] = await Promise.all([
        prisma.aIWorkflowRun.count({ where }),
        prisma.aIWorkflowRun.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            user: { select: { id: true, email: true, name: true } },
            project: { select: { id: true, name: true } },
            steps: {
              orderBy: { createdAt: 'asc' },
              include: {
                artifacts: {
                  orderBy: { createdAt: 'desc' },
                  take: 3,
                  select: { id: true, type: true, title: true, workflow: true, step: true, createdAt: true },
                },
                generations: {
                  orderBy: { createdAt: 'desc' },
                  take: 3,
                  select: {
                    id: true,
                    workflowStepId: true,
                    featureCode: true,
                    provider: true,
                    model: true,
                    status: true,
                    inputTokens: true,
                    outputTokens: true,
                    cachedInputTokens: true,
                    totalTokens: true,
                    actualCostUsd: true,
                    latencyMs: true,
                    errorCode: true,
                    errorMessage: true,
                    createdAt: true,
                    finishedAt: true,
                  },
                },
              },
            },
            artifacts: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { id: true, type: true, title: true, workflow: true, step: true, createdAt: true },
            },
            generations: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                workflowStepId: true,
                featureCode: true,
                provider: true,
                model: true,
                status: true,
                inputTokens: true,
                outputTokens: true,
                cachedInputTokens: true,
                totalTokens: true,
                actualCostUsd: true,
                latencyMs: true,
                errorCode: true,
                errorMessage: true,
                createdAt: true,
                finishedAt: true,
              },
            },
          },
        }),
      ]);

      res.json({
        total,
        limit,
        offset,
        workflows: runs.map((run) => {
          const totalTokens = run.generations.reduce((sum, generation) => sum + generation.totalTokens, 0);
          const costUsd = run.generations.reduce((sum, generation) => sum + usd(generation.actualCostUsd), 0);
          const failedSteps = run.steps.filter((step) => step.status === 'FAILED' || step.error);
          const failedGenerations = run.generations.filter((generation) => generation.status === 'FAILED' || generation.errorMessage);
          return {
            id: run.id,
            workflow: run.workflow,
            featureCode: run.featureCode,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            durationMs: run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : null,
            user: run.user,
            project: run.project,
            totals: {
              steps: run.steps.length,
              artifacts: run.artifacts.length,
              generations: run.generations.length,
              tokens: totalTokens,
              costUsd,
              costRub: costRub(costUsd),
            },
            errors: [
              ...failedSteps.map((step) => ({ type: 'step', step: step.step, message: step.error ?? 'Step failed' })),
              ...failedGenerations.map((generation) => ({
                type: 'generation',
                step: run.steps.find((step) => step.id === generation.workflowStepId)?.step ?? null,
                message: generation.errorMessage ?? generation.errorCode ?? 'Generation failed',
              })),
            ].slice(0, 5),
            steps: run.steps.map((step) => ({
              id: step.id,
              step: step.step,
              status: step.status,
              retryCount: step.retryCount,
              latencyMs: step.latencyMs,
              error: step.error,
              startedAt: step.startedAt,
              completedAt: step.completedAt,
              artifacts: step.artifacts,
              generations: step.generations.map((generation) => ({
                ...generation,
                actualCostUsd: usd(generation.actualCostUsd),
              })),
            })),
            artifacts: run.artifacts,
            generations: run.generations.map((generation) => ({
              ...generation,
              actualCostUsd: usd(generation.actualCostUsd),
            })),
          };
        }),
      });
    } catch (err) {
      console.error('[Admin] listWorkflows:', err);
      res.status(500).json({ error: 'Ошибка загрузки workflow history' });
    }
  },

  async listUsers(req: AuthRequest, res: Response): Promise<void> {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    const { q, plan, status, archive, limit, offset } = parsed.data;

    try {
      const where: Prisma.UserWhereInput = {
        ...(archive === 'ACTIVE' ? { archivedAt: null } : {}),
        ...(archive === 'ARCHIVED' ? { archivedAt: { not: null } } : {}),
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
          archivedAt: user.archivedAt,
          archivedById: user.archivedById,
          archiveReason: user.archiveReason,
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
          archivedAt: user.archivedAt,
          archivedById: user.archivedById,
          archiveReason: user.archiveReason,
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
          currentStage: user.projects[0]
            ? currentStage({ ...user.projects[0], products: user.projects[0].products.filter((product) => !isDemoProductText(product)) })
            : 'Нет проекта',
          projects: user.projects.map((project) => {
            const products = project.products.filter((product) => !isDemoProductText(product));
            const cleanProject = { ...project, products };
            return {
              id: project.id,
              name: project.name,
              status: project.status,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
              currentStage: currentStage(cleanProject),
              health: projectHealth(cleanProject),
              aiRequests: projectGenerationMap.get(project.id)?._count._all ?? 0,
              aiTokens: projectGenerationMap.get(project.id)?._sum.totalTokens ?? 0,
              aiCostUsd: usd(projectGenerationMap.get(project.id)?._sum.actualCostUsd),
              productsCount: products.length,
              generatedTextsCount: project.generatedTexts.length,
              contentPlanItemsCount: project.contentPlanItems.length,
              products,
              generatedTexts: project.generatedTexts,
              contentPlanItems: project.contentPlanItems,
            };
          }),
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

  async listPrompts(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const [versions, experiments] = await Promise.all([
        prisma.promptVersion.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 }),
        prisma.promptExperiment.findMany({
          orderBy: { updatedAt: 'desc' },
          include: { variants: { include: { promptVersion: true } } },
          take: 100,
        }),
      ]);
      const registry = promptRegistry.list().map((prompt) => ({
        id: prompt.id,
        workflow: prompt.workflow,
        step: prompt.step,
        feature: prompt.feature,
        model: prompt.model,
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens,
        artifactType: prompt.artifactType,
      }));
      res.json({ registry, versions, experiments });
    } catch (err) {
      console.error('[Admin] listPrompts:', err);
      res.status(500).json({ error: 'Ошибка загрузки prompt CMS' });
    }
  },

  async createPromptVersion(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createPromptVersionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      const prompt = promptRegistry.get(parsed.data.workflow, parsed.data.step);
      const version = await prisma.promptVersion.create({
        data: promptCmsService.promptVersionData({ prompt, userId: req.userId!, data: parsed.data }),
      });
      await prisma.aIConfigurationAuditLog.create({
        data: {
          actorUserId: req.userId!,
          configType: 'prompt_version',
          configKey: `${parsed.data.workflow}.${parsed.data.step}`,
          operation: 'CREATE_VERSION',
          after: version as unknown as Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ version });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка создания версии промпта';
      res.status(message.includes('not found') ? 404 : 500).json({ error: message });
    }
  },

  async createPromptExperiment(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createPromptExperimentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      promptRegistry.get(parsed.data.workflow, parsed.data.step);
      const experiment = await prisma.promptExperiment.create({
        data: {
          name: parsed.data.name,
          workflow: parsed.data.workflow,
          step: parsed.data.step,
          status: parsed.data.status,
          trafficPct: parsed.data.trafficPct,
          startedAt: parsed.data.status === 'RUNNING' ? new Date() : null,
          createdById: req.userId!,
          variants: {
            create: parsed.data.variants.map((variant) => ({
              name: variant.name,
              promptVersionId: variant.promptVersionId ?? null,
              trafficWeight: variant.trafficWeight,
              isControl: variant.isControl,
            })),
          },
        },
        include: { variants: { include: { promptVersion: true } } },
      });
      await prisma.aIConfigurationAuditLog.create({
        data: {
          actorUserId: req.userId!,
          configType: 'prompt_experiment',
          configKey: experiment.id,
          operation: 'CREATE',
          after: experiment as unknown as Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ experiment });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка создания A/B теста';
      res.status(message.includes('not found') ? 404 : 500).json({ error: message });
    }
  },

  async promptExperimentStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const experiment = await prisma.promptExperiment.findUnique({
        where: { id: req.params.id as string },
        include: { variants: true },
      });
      if (!experiment) { res.status(404).json({ error: 'Эксперимент не найден' }); return; }

      const generations = await prisma.aIGeneration.findMany({
        where: {
          createdAt: { gte: experiment.startedAt ?? experiment.createdAt },
          metadata: { path: ['promptExperimentId'], equals: experiment.id },
        },
        select: { status: true, actualCostUsd: true, totalTokens: true, latencyMs: true, metadata: true },
      });
      const byVariant = new Map<string, { variantId: string; requests: number; succeeded: number; failed: number; costUsd: number; tokens: number; latency: number[] }>();
      for (const generation of generations) {
        const metadata = parseMetadata(generation.metadata);
        const variantId = String(metadata.promptExperimentVariantId ?? 'unknown');
        const item = byVariant.get(variantId) ?? { variantId, requests: 0, succeeded: 0, failed: 0, costUsd: 0, tokens: 0, latency: [] };
        item.requests += 1;
        if (generation.status === 'SUCCEEDED') item.succeeded += 1;
        if (generation.status === 'FAILED') item.failed += 1;
        item.costUsd += usd(generation.actualCostUsd);
        item.tokens += generation.totalTokens;
        if (generation.latencyMs) item.latency.push(generation.latencyMs);
        byVariant.set(variantId, item);
      }
      res.json({
        experiment,
        stats: Array.from(byVariant.values()).map((item) => ({
          ...item,
          successRate: item.requests > 0 ? Math.round((item.succeeded / item.requests) * 100) : 0,
          avgCostUsd: item.requests > 0 ? item.costUsd / item.requests : 0,
          avgTokens: item.requests > 0 ? Math.round(item.tokens / item.requests) : 0,
          avgLatencyMs: item.latency.length ? Math.round(item.latency.reduce((sum, value) => sum + value, 0) / item.latency.length) : 0,
        })),
      });
    } catch (err) {
      console.error('[Admin] promptExperimentStats:', err);
      res.status(500).json({ error: 'Ошибка статистики A/B теста' });
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

  async updateUserPlan(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const target = await prisma.user.findUnique({ where: { id: req.params.id as string }, include: { subscription: true } });
      if (!target) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

      const plan = toSubscriptionPlan(parsed.data.planId as PlanId);
      const subscription = await prisma.subscription.upsert({
        where: { userId: target.id },
        create: {
          userId: target.id,
          plan,
          status: 'ACTIVE',
        },
        update: {
          plan,
          status: 'ACTIVE',
        },
      });

      await prisma.userEvent.create({
        data: {
          userId: target.id,
          actorId: req.userId!,
          type: 'admin_plan_updated',
          metadata: {
            planId: parsed.data.planId,
            plan,
          },
        },
      });

      res.json({ ok: true, subscription });
    } catch (err) {
      console.error('[Admin] updateUserPlan:', err);
      res.status(500).json({ error: 'Ошибка смены тарифа' });
    }
  },

  async archiveUser(req: AuthRequest, res: Response): Promise<void> {
    const parsed = archiveUserSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.id as string },
        select: { id: true, email: true, name: true, archivedAt: true },
      });
      if (!target) { res.status(404).json({ error: 'Пользователь не найден' }); return; }
      if (target.id === req.userId && parsed.data.archived) {
        res.status(400).json({ error: 'Нельзя архивировать текущего администратора' });
        return;
      }

      const now = new Date();
      const user = await prisma.user.update({
        where: { id: target.id },
        data: parsed.data.archived
          ? {
              archivedAt: target.archivedAt ?? now,
              archivedById: req.userId!,
              archiveReason: parsed.data.reason?.trim() || null,
            }
          : {
              archivedAt: null,
              archivedById: null,
              archiveReason: null,
            },
        select: {
          id: true,
          email: true,
          name: true,
          archivedAt: true,
          archivedById: true,
          archiveReason: true,
        },
      });

      await prisma.userEvent.create({
        data: {
          userId: target.id,
          actorId: req.userId!,
          type: parsed.data.archived ? 'admin_user_archived' : 'admin_user_unarchived',
          metadata: {
            email: target.email,
            reason: parsed.data.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      res.json({ ok: true, user });
    } catch (err) {
      console.error('[Admin] archiveUser:', err);
      res.status(500).json({ error: 'Ошибка архивирования пользователя' });
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

      const accessToken = authService.issueAccessToken(user.id);
      await prisma.userEvent.create({
        data: {
          userId: user.id,
          actorId: req.userId!,
          type: 'admin_impersonation_started',
          metadata: { email: user.email } as Prisma.InputJsonValue,
        },
      });

      res.json({ user, tokens: { accessToken } });
    } catch (err) {
      console.error('[Admin] impersonateUser:', err);
      res.status(500).json({ error: 'Ошибка входа под пользователем' });
    }
  },
};
