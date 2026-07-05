import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { projectService } from '../services/project.service';
import { eventService } from '../services/event.service';
import { AccessPolicyError } from '../services/access-policy.service';
import { sanitizeProjectStrategyData } from '../utils/demo-products';

function sendAccessPolicyError(res: Response, err: AccessPolicyError) {
  res.status(err.status).json({
    error: err.code,
    message: err.message,
    limitType: err.limitType,
    current: err.current,
    limit: err.limit,
    planId: err.planId,
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  niche: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

const completeStrategySchema = z.object({
  summary: z.string().max(10000).optional(),
  strategyData: z.record(z.unknown()).optional(),
});

const saveStrategySchema = z.object({
  answers:   z.record(z.string()).optional(),
  completed: z.boolean().optional(),
  expertProfileData: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    niche: z.string().optional(),
    experienceYears: z.string().optional(),
    workFormats: z.string().optional(),
    productsAndPrices: z.string().optional(),
    competencies: z.string().optional(),
    antiPreferences: z.string().optional(),
    values: z.string().optional(),
    credentials: z.string().optional(),
    achievements: z.string().optional(),
    uploadedFileText: z.string().optional(),
    summary: z.string().optional(),
    completed: z.boolean().optional(),
    updatedAt: z.string().optional(),
  }).passthrough().optional(),
  positioningData: z.object({
    role: z.string().optional(),
    audience: z.string().optional(),
    problem: z.string().optional(),
    result: z.string().optional(),
    statement: z.string().optional(),
    completed: z.boolean().optional(),
    updatedAt: z.string().optional(),
  }).passthrough().optional(),
  // unpacking data
  unpackingData: z.record(z.unknown()).optional(),
  unpackingAnswers:   z.record(z.unknown()).optional(),
  unpackingCompleted: z.boolean().optional(),
  // progress flags
  progressFlags: z.record(z.boolean()).optional(),
  materialsData: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    title: z.string(),
    content: z.string(),
    summary: z.string(),
    summaryStatus: z.string().optional(),
    linkedMaterialIds: z.array(z.string()).optional(),
    versions: z.array(z.object({
      content: z.string(),
      summary: z.string(),
      updatedAt: z.string(),
    }).passthrough()).optional(),
    updatedAt: z.string(),
  }).passthrough()).optional(),
  generatedData: z.record(z.unknown()).optional(),
});

async function saveNormalizedProjectData(input: {
  userId: string;
  projectId: string;
  data: z.infer<typeof saveStrategySchema>;
}): Promise<void> {
  const { prisma } = await import('../lib/prisma');
  const rows: Array<{
    domain: string;
    kind: string;
    key: string;
    title: string;
    content: string;
    data: Record<string, unknown>;
  }> = [];

  if (input.data.expertProfileData) {
    rows.push({
      domain: 'strategy',
      kind: 'expert_profile',
      key: 'expert_profile.current',
      title: 'О себе',
      content: String(input.data.expertProfileData.aiSummary ?? input.data.expertProfileData.summary ?? input.data.expertProfileData.whoYouAre ?? input.data.expertProfileData.role ?? ''),
      data: input.data.expertProfileData as Record<string, unknown>,
    });
  }

  if (input.data.positioningData) {
    rows.push({
      domain: 'positioning',
      kind: 'positioning_current',
      key: 'positioning.current',
      title: 'Позиционирование',
      content: String(input.data.positioningData.statement ?? input.data.positioningData.role ?? ''),
      data: input.data.positioningData as Record<string, unknown>,
    });
  }

  const generated = input.data.generatedData as Record<string, unknown> | undefined;
  for (const [key, kind, title] of [
    ['productMain', 'product_main', 'Основной продукт'],
    ['productMini', 'product_mini', 'Мини-продукт'],
    ['leadMagnet', 'lead_magnet', 'Лид-магнит'],
  ] as const) {
    const value = generated?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      rows.push({
        domain: 'product',
        kind,
        key: `generated.${key}`,
        title,
        content: String(record.markdown ?? record.description ?? record.productDescription ?? record.offer ?? ''),
        data: record,
      });
    }
  }

  if (!rows.length) return;
  await prisma.$transaction([
    prisma.projectStructuredOutput.deleteMany({
      where: {
        userId: input.userId,
        projectId: input.projectId,
        source: 'project_strategy',
        key: { in: rows.map((row) => row.key) },
      },
    }),
    ...rows.map((row) => prisma.projectStructuredOutput.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        domain: row.domain,
        kind: row.kind,
        key: row.key,
        title: row.title,
        content: row.content,
        data: row.data as Prisma.InputJsonValue,
        source: 'project_strategy',
      },
    })),
  ]);
}

export const projectController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projects = await projectService.list(req.userId!);
      res.json({ projects });
    } catch (err) {
      console.error('[Projects] list:', err);
      res.status(500).json({ error: 'Ошибка при загрузке проектов' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const project = await projectService.create(req.userId!, parsed.data);
      void eventService.track('project_created', {
        userId: req.userId!,
        metadata: { projectId: project.id, name: project.name },
      }).catch(() => {});
      res.status(201).json({ project });
    } catch (err) {
      console.error('[Projects] create:', err);
      if (err instanceof AccessPolicyError) {
        sendAccessPolicyError(res, err);
        return;
      }
      res.status(500).json({ error: 'Ошибка при создании проекта' });
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const project = await projectService.getOwned(req.userId!, req.params.id as string);
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.json({ project });
    } catch (err) {
      console.error('[Projects] get:', err);
      res.status(500).json({ error: 'Ошибка при загрузке проекта' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const project = await projectService.update(req.userId!, req.params.id as string, parsed.data);
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.json({ project });
    } catch (err) {
      console.error('[Projects] update:', err);
      res.status(500).json({ error: 'Ошибка при обновлении проекта' });
    }
  },

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const deleted = await projectService.delete(req.userId!, req.params.id as string);
      if (!deleted) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Projects] delete:', err);
      res.status(500).json({ error: 'Ошибка при удалении проекта' });
    }
  },

  async completeStrategy(req: AuthRequest, res: Response): Promise<void> {
    const parsed = completeStrategySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const project = await projectService.completeStrategy(
        req.userId!,
        req.params.id as string,
        parsed.data,
      );
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.json({ project });
    } catch (err) {
      console.error('[Projects] completeStrategy:', err);
      res.status(500).json({ error: 'Ошибка при завершении стратегии' });
    }
  },

  /** GET /api/v1/projects/:id/strategy — load persisted project data */
  async getStrategyData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const project = await projectService.getOwned(req.userId!, req.params.id as string);
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.json({
        strategyData: project.strategyData
          ? sanitizeProjectStrategyData(project.strategyData as Record<string, unknown>)
          : null,
      });
    } catch (err) {
      console.error('[Projects] getStrategyData:', err);
      res.status(500).json({ error: 'Ошибка при загрузке данных стратегии' });
    }
  },

  /** GET /api/v1/projects/:id/utp — load UTP chat + formats */
  async getUtpData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { prisma } = await import('../lib/prisma');
      const project = await prisma.project.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
        select: { utpData: true },
      });
      if (!project) { res.status(404).json({ error: 'Проект не найден' }); return; }
      res.json(project.utpData ?? null);
    } catch (err) {
      console.error('[Projects] getUtpData:', err);
      res.status(500).json({ error: 'Ошибка загрузки' });
    }
  },

  /** PATCH /api/v1/projects/:id/utp — save UTP chat + formats */
  async saveUtpData(req: AuthRequest, res: Response): Promise<void> {
    const { messages, formats } = req.body as { messages?: unknown[]; formats?: unknown };
    try {
      const { prisma } = await import('../lib/prisma');
      const project = await prisma.project.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
        select: { id: true },
      });
      if (!project) { res.status(404).json({ error: 'Проект не найден' }); return; }
      await prisma.project.update({
        where: { id: req.params.id as string },
        data: { utpData: { messages, formats, updatedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[Projects] saveUtpData:', err);
      res.status(500).json({ error: 'Ошибка сохранения' });
    }
  },

  /** PATCH /api/v1/projects/:id/strategy — save audience/unpacking/progress data */
  async saveStrategyData(req: AuthRequest, res: Response): Promise<void> {
    const parsed = saveStrategySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const project = await projectService.getOwned(req.userId!, req.params.id as string);
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      // Merge new data into existing strategyData
      const existing = sanitizeProjectStrategyData((project.strategyData as Record<string, unknown>) ?? {});
      const cleanedData = sanitizeProjectStrategyData(parsed.data);
      const merged = sanitizeProjectStrategyData({ ...existing, ...cleanedData }) as Prisma.InputJsonValue;
      const { prisma } = await import('../lib/prisma');
      await prisma.project.update({
        where: { id: req.params.id as string },
        data: { strategyData: merged },
      });
      await saveNormalizedProjectData({
        userId: req.userId!,
        projectId: req.params.id as string,
        data: cleanedData,
      });
      void eventService.track('strategy_saved', {
        userId: req.userId!,
        metadata: {
          projectId: req.params.id,
          keys: Object.keys(parsed.data),
        },
      }).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      console.error('[Projects] saveStrategyData:', err);
      res.status(500).json({ error: 'Ошибка при сохранении данных стратегии' });
    }
  },
};
