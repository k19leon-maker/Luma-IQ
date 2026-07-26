import { Response } from 'express';
import { z } from 'zod';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../config/ai-action-registry';
import { AuthRequest } from '../middleware/auth.middleware';
import { aiEconomicsV2Service } from '../services/ai-economics-v2.service';

const actionKeySchema = z.string().refine(
  (value) => value in AI_ACTION_DEFINITIONS,
  'Неизвестный action key',
);

const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  plan: z.string().max(80).optional(),
  actionKey: actionKeySchema.optional(),
  section: z.string().max(120).optional(),
  modelAlias: z.string().max(120).optional(),
  userId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  batch: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  status: z.string().max(80).optional(),
  promptVersion: z.string().max(160).optional(),
  actionPricingVersionId: z.string().uuid().optional(),
}).strict();

const applyPriceSchema = z.object({
  actionKey: actionKeySchema,
  aiPoints: z.number().int().min(1).max(100_000),
  sampleSize: z.number().int().min(0),
  p90CostUsd: z.number().min(0),
  confirmation: z.string().min(1).max(240),
}).strict();

const simulateSchema = z.object({
  planId: z.string(),
  actionMix: z.record(z.number().int().min(0).max(100_000)),
}).strict();

function validationError(res: Response, parsed: { success: false; error: z.ZodError }): void {
  res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Некорректные данные' });
}

function serviceError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Ошибка AI-экономики';
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: number }).status)
    : message.startsWith('UNKNOWN_') ? 400 : 500;
  res.status(status).json({ error: message });
}

export const aiEconomicsV2Controller = {
  async report(req: AuthRequest, res: Response): Promise<void> {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.json(await aiEconomicsV2Service.report(parsed.data));
    } catch (error) {
      serviceError(res, error);
    }
  },

  async applyPrice(req: AuthRequest, res: Response): Promise<void> {
    const parsed = applyPriceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.status(201).json(await aiEconomicsV2Service.applyRecommendedPrice({
        actorUserId: req.userId!,
        actionKey: parsed.data.actionKey as AIActionKey,
        aiPoints: parsed.data.aiPoints,
        sampleSize: parsed.data.sampleSize,
        p90CostUsd: parsed.data.p90CostUsd,
        confirmation: parsed.data.confirmation,
      }));
    } catch (error) {
      serviceError(res, error);
    }
  },

  async simulate(req: AuthRequest, res: Response): Promise<void> {
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      const planId = aiEconomicsV2Service.validatePlanId(parsed.data.planId);
      res.json(await aiEconomicsV2Service.simulateTariff({
        planId,
        actionMix: parsed.data.actionMix,
      }));
    } catch (error) {
      serviceError(res, error);
    }
  },

  async reconcile(req: AuthRequest, res: Response): Promise<void> {
    const parsed = z.object({
      from: z.coerce.date(),
      to: z.coerce.date(),
    }).strict().safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.json(await aiEconomicsV2Service.reconcileOpenAiCosts(parsed.data));
    } catch (error) {
      serviceError(res, error);
    }
  },
};
