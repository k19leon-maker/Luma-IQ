import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { promptRegistry } from '../prompts/registry';
import { aiWorkflowService } from '../services/ai-workflow.service';

const workflowBodySchema = z.object({
  projectId: z.string().uuid(),
  step: z.string().min(1).max(80).optional(),
  inputs: z.record(z.unknown()).optional().default({}),
  workflowRunId: z.string().uuid().optional(),
  provider: z.enum(['chatgpt', 'claude']).optional(),
  openaiModel: z.string().optional(),
  claudeModel: z.string().optional(),
  idempotencyKey: z.string().max(200).optional(),
});

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

export const aiWorkflowController = {
  listPrompts(_req: AuthRequest, res: Response): void {
    res.json({
      prompts: promptRegistry.list().map((prompt) => ({
        id: prompt.id,
        version: prompt.version,
        feature: prompt.feature,
        workflow: prompt.workflow,
        step: prompt.step,
        model: prompt.model,
        maxTokens: prompt.maxTokens,
        artifactType: prompt.artifactType,
        validationRules: prompt.validationRules,
      })),
    });
  },

  async start(req: AuthRequest, res: Response): Promise<void> {
    const parsed = workflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const resolved = resolveWorkflowStep(param(req.params.workflow), parsed.data.step);
      const result = await aiWorkflowService.run({
        userId: req.userId!,
        workflow: resolved.workflow,
        projectId: parsed.data.projectId,
        step: resolved.step,
        inputs: parsed.data.inputs,
        provider: parsed.data.provider,
        openaiModel: parsed.data.openaiModel,
        claudeModel: parsed.data.claudeModel,
        idempotencyKey: parsed.data.idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка AI workflow';
      const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : message.includes('not found') || message.includes('не найден') ? 404 : 500;
      res.status(status).json({ error: message });
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
      const result = await aiWorkflowService.run({
        userId: req.userId!,
        workflow: resolved.workflow,
        projectId: parsed.data.projectId,
        workflowRunId: parsed.data.workflowRunId,
        step: resolved.step,
        inputs: parsed.data.inputs,
        provider: parsed.data.provider,
        openaiModel: parsed.data.openaiModel,
        claudeModel: parsed.data.claudeModel,
        idempotencyKey: parsed.data.idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка AI workflow';
      const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : message.includes('not found') || message.includes('не найден') ? 404 : 500;
      res.status(status).json({ error: message });
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
