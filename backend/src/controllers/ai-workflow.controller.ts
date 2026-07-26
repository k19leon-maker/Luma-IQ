import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { promptRegistry } from '../prompts/registry';
import { aiWorkflowService } from '../services/ai-workflow.service';
import { aiRuntimeService } from '../services/ai-runtime.service';
import { AI_ACTION_LABELS, AI_ACTION_SECTIONS, type AiActionType } from '../config/ai-actions';

const workflowBodySchema = z.object({
  projectId: z.string().uuid(),
  step: z.string().min(1).max(80).optional(),
  inputs: z.record(z.unknown()).optional().default({}),
  workflowRunId: z.string().uuid().optional(),
  provider: z.enum(['chatgpt', 'claude']).optional(),
  idempotencyKey: z.string().max(200).optional(),
}).strip();

const cancelBodySchema = z.object({
  workflowRunId: z.string().uuid(),
});

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function resolveWorkflowStep(workflowParam: string, bodyStep?: string): { workflow: string; step: string } {
  if (bodyStep) return { workflow: workflowParam, step: bodyStep };
  const parts = workflowParam.split('.').filter(Boolean);
  if (parts.length < 2) throw new Error('Укажите workflow и step');
  return { workflow: parts.slice(0, -1).join('.'), step: parts[parts.length - 1] };
}

function publicWorkflowResult(result: Awaited<ReturnType<typeof aiRuntimeService.runWorkflow>>) {
  const publicResult: Record<string, unknown> = { ...result };
  delete publicResult.model;
  delete publicResult.provider;
  return publicResult;
}

function publicWorkflowError(err: unknown, message: string) {
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : '';
  const insufficient = code === 'AI_BALANCE_EXHAUSTED' || message === 'AI-баланс закончился';
  return {
    error: message,
    userMessage: insufficient
      ? 'Недостаточно AI-баллов для этого действия. Запрос к AI не запускался, баллы не списаны.'
      : 'Генерация не завершена. AI-баллы не списаны или возвращены на баланс.',
    aiBalanceStatus: insufficient ? 'insufficient' : 'unchanged_or_released',
  };
}

export const aiWorkflowController = {
  listPrompts(_req: AuthRequest, res: Response): void {
    res.json({
      prompts: promptRegistry.list().map((prompt) => ({
        id: prompt.id,
        version: prompt.version,
        feature: prompt.feature,
        workflow: prompt.workflow,
        step: prompt.step,
        modelRouting: 'server',
        maxTokens: prompt.maxTokens,
        artifactType: prompt.artifactType,
        validationRules: prompt.validationRules,
      })),
    });
  },

  async quote(req: AuthRequest, res: Response): Promise<void> {
    const parsed = workflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const resolved = resolveWorkflowStep(param(req.params.workflow), parsed.data.step);
      const quote = await aiRuntimeService.quote({
        userId: req.userId!,
        workflow: resolved.workflow,
        projectId: parsed.data.projectId,
        step: resolved.step,
        inputs: parsed.data.inputs,
      });
      const publicAction = quote.actionKey as AiActionType;
      res.json({
        actionKey: quote.actionKey,
        actionLabel: AI_ACTION_LABELS[publicAction] ?? 'AI-действие',
        sectionLabel: AI_ACTION_SECTIONS[publicAction] ?? 'Luma IQ',
        aiPoints: quote.aiPoints,
        aiBalanceRemaining: quote.aiBalanceRemaining,
        aiBalanceAfter: quote.aiBalanceAfter,
        affordable: quote.affordable,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось рассчитать стоимость';
      res.status(400).json({ error: message });
    }
  },

  async start(req: AuthRequest, res: Response): Promise<void> {
    const parsed = workflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const resolved = resolveWorkflowStep(param(req.params.workflow), parsed.data.step);
      const result = await aiRuntimeService.runWorkflow({
        userId: req.userId!,
        workflow: resolved.workflow,
        projectId: parsed.data.projectId,
        step: resolved.step,
        inputs: parsed.data.inputs,
        provider: parsed.data.provider,
        idempotencyKey: parsed.data.idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
      });
      res.json(publicWorkflowResult(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка AI workflow';
      const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : message.includes('not found') || message.includes('не найден') ? 404 : 500;
      res.status(status).json(publicWorkflowError(err, message));
    }
  },

  async step(req: AuthRequest, res: Response): Promise<void> {
    const parsed = workflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const resolved = resolveWorkflowStep(param(req.params.workflow), parsed.data.step);
      const result = await aiRuntimeService.runWorkflow({
        userId: req.userId!,
        workflow: resolved.workflow,
        projectId: parsed.data.projectId,
        workflowRunId: parsed.data.workflowRunId,
        step: resolved.step,
        inputs: parsed.data.inputs,
        provider: parsed.data.provider,
        idempotencyKey: parsed.data.idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
      });
      res.json(publicWorkflowResult(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка AI workflow';
      const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : message.includes('not found') || message.includes('не найден') ? 404 : 500;
      res.status(status).json(publicWorkflowError(err, message));
    }
  },

  async cancel(req: AuthRequest, res: Response): Promise<void> {
    const parsed = cancelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const run = await aiWorkflowService.cancel({
        userId: req.userId!,
        workflowRunId: parsed.data.workflowRunId,
      });
      res.json({ ok: true, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка отмены workflow';
      res.status(message.includes('не найден') ? 404 : 500).json({ error: message });
    }
  },
};
