import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const createSchema = z.object({
  projectId: z.string().uuid(),
  type:      z.string().max(50),
  title:     z.string().max(500),
  content:   z.string().optional(),
  platform:  z.string().max(100).optional(),
  status:    z.enum(['draft', 'ready', 'published']).default('draft'),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceId:  z.string().optional(),
});

const updateSchema = z.object({
  title:    z.string().max(500).optional(),
  content:  z.string().optional(),
  platform: z.string().max(100).optional(),
  status:   z.enum(['draft', 'ready', 'published']).optional(),
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  return !!p && p.userId === userId;
}

export const contentPlanController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const { projectId } = req.query as { projectId?: string };
    if (!projectId) { res.status(400).json({ error: 'projectId обязателен' }); return; }
    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    try {
      const items = await prisma.contentPlanItem.findMany({
        where:   { projectId },
        orderBy: { date: 'asc' },
      });
      res.json({ items });
    } catch (err) {
      console.error('[ContentPlan] list:', err);
      res.status(500).json({ error: 'Ошибка при загрузке плана' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const owned = await assertProjectOwner(req.userId!, parsed.data.projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    try {
      const item = await prisma.contentPlanItem.create({ data: parsed.data });
      res.status(201).json({ item });
    } catch (err) {
      console.error('[ContentPlan] create:', err);
      res.status(500).json({ error: 'Ошибка при добавлении в план' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const id = req.params.id as string;
    try {
      const existing = await prisma.contentPlanItem.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      const item = await prisma.contentPlanItem.update({
        where: { id },
        data:  parsed.data,
      });
      res.json({ item });
    } catch (err) {
      console.error('[ContentPlan] update:', err);
      res.status(500).json({ error: 'Ошибка при обновлении' });
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const id = req.params.id as string;
    try {
      const existing = await prisma.contentPlanItem.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      await prisma.contentPlanItem.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[ContentPlan] remove:', err);
      res.status(500).json({ error: 'Ошибка при удалении' });
    }
  },
};
