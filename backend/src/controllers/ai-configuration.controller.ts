import { AIProvider, Prisma } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../config/ai-action-registry';
import { AI_FEATURE_FLAG_KEYS, AI_MODEL_ALIASES } from '../config/ai-v2';
import { AuthRequest } from '../middleware/auth.middleware';
import { aiConfigurationService } from '../services/ai-configuration.service';
import { aiPointReconciliationService } from '../services/ai-point-reconciliation.service';
import { aiPilotMetricsService } from '../services/ai-pilot-metrics.service';

const flagSchema = z.object({
  enabled: z.boolean(),
  description: z.string().max(500).optional(),
}).strict();

const modelProfileSchema = z.object({
  alias: z.enum(AI_MODEL_ALIASES),
  provider: z.enum(['OPENAI', 'ANTHROPIC']),
  actualModelId: z.string().min(1).max(160),
  validFrom: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const actionPricingSchema = z.object({
  actionKey: z.string().refine((value) => value in AI_ACTION_DEFINITIONS, 'Неизвестный action key'),
  aiPoints: z.number().int().min(0).max(100_000),
  validFrom: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const actionDefinitionSchema = z.object({
  actionKey: z.string().refine((value) => value in AI_ACTION_DEFINITIONS, 'Неизвестный action key'),
  pipeline: z.array(z.object({
    stage: z.string().min(1).max(80),
    modelAlias: z.enum(AI_MODEL_ALIASES),
    reasoning: z.enum(['low', 'medium', 'high']),
  })).min(1).max(12),
  contextBudget: z.number().int().min(0).max(1_000_000),
  outputLimit: z.number().int().min(0).max(200_000),
  retryPolicy: z.record(z.unknown()),
  fallbackPolicy: z.record(z.unknown()),
  batchEligible: z.boolean(),
  validFrom: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

function errorResponse(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Ошибка AI-конфигурации';
  res.status(message.startsWith('UNKNOWN_') ? 400 : 500).json({ error: message });
}

export const aiConfigurationController = {
  async pilotMetrics(req: AuthRequest, res: Response): Promise<void> {
    const parsed = z.object({
      days: z.coerce.number().int().min(1).max(180).optional(),
      userId: z.string().uuid().optional(),
    }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.json(await aiPilotMetricsService.report(parsed.data));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async snapshot(_req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await aiConfigurationService.snapshot());
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async setFlag(req: AuthRequest, res: Response): Promise<void> {
    const key = req.params.key as string;
    if (!(AI_FEATURE_FLAG_KEYS as readonly string[]).includes(key)) {
      res.status(400).json({ error: 'Неизвестный feature flag' });
      return;
    }
    const parsed = flagSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.json(await aiConfigurationService.setFeatureFlag({
        actorUserId: req.userId!,
        key,
        ...parsed.data,
      }));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async createModelProfile(req: AuthRequest, res: Response): Promise<void> {
    const parsed = modelProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.status(201).json(await aiConfigurationService.createModelProfileVersion({
        actorUserId: req.userId!,
        alias: parsed.data.alias,
        provider: parsed.data.provider as AIProvider,
        actualModelId: parsed.data.actualModelId,
        validFrom: parsed.data.validFrom ?? new Date(),
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      }));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async createActionPricing(req: AuthRequest, res: Response): Promise<void> {
    const parsed = actionPricingSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.status(201).json(await aiConfigurationService.createActionPricingVersion({
        actorUserId: req.userId!,
        actionKey: parsed.data.actionKey as AIActionKey,
        aiPoints: parsed.data.aiPoints,
        validFrom: parsed.data.validFrom ?? new Date(),
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      }));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async createActionDefinition(req: AuthRequest, res: Response): Promise<void> {
    const parsed = actionDefinitionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.status(201).json(await aiConfigurationService.createActionDefinitionVersion({
        actorUserId: req.userId!,
        actionKey: parsed.data.actionKey as AIActionKey,
        pipeline: parsed.data.pipeline as Prisma.InputJsonValue,
        contextBudget: parsed.data.contextBudget,
        outputLimit: parsed.data.outputLimit,
        retryPolicy: parsed.data.retryPolicy as Prisma.InputJsonValue,
        fallbackPolicy: parsed.data.fallbackPolicy as Prisma.InputJsonValue,
        batchEligible: parsed.data.batchEligible,
        validFrom: parsed.data.validFrom ?? new Date(),
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      }));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async reconcileUserAiPoints(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await aiPointReconciliationService.reconcileUserCurrentPeriod(req.params.userId as string));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async sweepAiPointReservations(req: AuthRequest, res: Response): Promise<void> {
    const parsed = z.object({
      olderThanMinutes: z.number().int().min(15).max(10_080).optional(),
    }).strict().safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.json(await aiPointReconciliationService.sweepStaleReservations(parsed.data));
    } catch (error) {
      errorResponse(res, error);
    }
  },

  async refundAiPoints(req: AuthRequest, res: Response): Promise<void> {
    const parsed = z.object({
      generationId: z.string().uuid(),
      reason: z.string().min(3).max(1000),
    }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    try {
      res.json(await aiPointReconciliationService.refundGeneration({
        ...parsed.data,
        actorUserId: req.userId!,
      }));
    } catch (error) {
      errorResponse(res, error);
    }
  },
};
