import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { projectService } from '../services/project.service';

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
};
