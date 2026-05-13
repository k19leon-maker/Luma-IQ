import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { projectService } from '../services/project.service';
import { eventService } from '../services/event.service';

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
    updatedAt: z.string(),
  }).passthrough()).optional(),
});

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
      res.json({ strategyData: project.strategyData ?? null });
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
      const existing = (project.strategyData as Record<string, unknown>) ?? {};
      const merged   = { ...existing, ...parsed.data } as Prisma.InputJsonValue;
      const { prisma } = await import('../lib/prisma');
      await prisma.project.update({
        where: { id: req.params.id as string },
        data: { strategyData: merged },
      });
      void eventService.track('strategy_saved', {
        userId: req.userId!,
        metadata: { projectId: req.params.id, keys: Object.keys(parsed.data) },
      }).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      console.error('[Projects] saveStrategyData:', err);
      res.status(500).json({ error: 'Ошибка при сохранении данных стратегии' });
    }
  },
};
