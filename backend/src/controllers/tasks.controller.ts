import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { tasksService } from '../services/tasks.service';

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(80),
  priority: z.string().min(1).max(40),
  status: z.enum(['all', 'today', 'week', 'done']).default('all'),
  dueBucket: z.string().max(40).optional(),
  route: z.string().max(300).optional(),
});

const updateTaskSchema = z.object({
  status: z.enum(['all', 'today', 'week', 'done']).optional(),
  dueBucket: z.string().max(40).optional(),
  done: z.boolean().optional(),
});

export const tasksController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const projectId = String(req.query.projectId ?? '');
    if (!projectId) {
      res.status(400).json({ error: 'projectId обязателен' });
      return;
    }
    try {
      const tasks = await tasksService.list(req.userId!, projectId);
      res.json({ tasks });
    } catch (err) {
      console.error('[Tasks] list:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Ошибка при загрузке задач' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const task = await tasksService.create(req.userId!, parsed.data);
      res.status(201).json({ task });
    } catch (err) {
      console.error('[Tasks] create:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Ошибка при создании задачи' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const task = await tasksService.update(req.userId!, req.params.id as string, parsed.data);
      res.json({ task });
    } catch (err) {
      console.error('[Tasks] update:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Ошибка при обновлении задачи' });
    }
  },
};
