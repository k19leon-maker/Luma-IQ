import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { batchJobService } from '../services/batch-job.service';

const itemSchema = z.object({
  customId: z.string().min(1).max(80).optional(),
  title: z.string().max(240).optional(),
  inputs: z.record(z.unknown()),
}).strip();

const createSchema = z.object({
  projectId: z.string().uuid(),
  workflow: z.string().min(1).max(100),
  step: z.string().min(1).max(80),
  items: z.array(itemSchema).min(2).max(100),
  idempotencyKey: z.string().min(12).max(200).optional(),
}).strip();

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function status(error: unknown): number {
  return typeof error === 'object' && error !== null
    && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : 500;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Ошибка фоновой генерации';
}

export const aiBatchController = {
  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const idempotencyKey = parsed.data.idempotencyKey
      ?? req.header('idempotency-key')
      ?? req.header('x-idempotency-key');
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Для фоновой генерации нужен idempotencyKey' });
      return;
    }
    try {
      const job = await batchJobService.create({
        userId: req.userId!,
        ...parsed.data,
        idempotencyKey,
      });
      res.status(202).json({ job });
    } catch (cause) {
      res.status(status(cause)).json({ error: message(cause) });
    }
  },

  async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jobs = await batchJobService.list(
        req.userId!,
        typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
      );
      res.json({ jobs });
    } catch (cause) {
      res.status(status(cause)).json({ error: message(cause) });
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({ job: await batchJobService.get(req.userId!, param(req.params.id)) });
    } catch (cause) {
      res.status(status(cause)).json({ error: message(cause) });
    }
  },

  async refresh(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({ job: await batchJobService.refresh(req.userId!, param(req.params.id)) });
    } catch (cause) {
      res.status(status(cause)).json({ error: message(cause) });
    }
  },

  async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({ job: await batchJobService.cancel(req.userId!, param(req.params.id)) });
    } catch (cause) {
      res.status(status(cause)).json({ error: message(cause) });
    }
  },
};
