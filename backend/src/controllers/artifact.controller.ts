import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { aiWorkflowService } from '../services/ai-workflow.service';

const listSchema = z.object({
  projectId: z.string().uuid().optional(),
  workflow: z.string().max(120).optional(),
  type: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const regenerateSchema = z.object({
  inputs: z.record(z.unknown()).optional(),
  provider: z.enum(['chatgpt', 'claude']).optional(),
}).strip();

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function getOwnedArtifact(userId: string, id: string) {
  return prisma.aIArtifact.findFirst({
    where: { id, userId },
    include: { workflowRun: true, workflowStep: true },
  });
}

export const artifactController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const { projectId, workflow, type, limit, offset } = parsed.data;

    try {
      if (projectId) {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.userId! }, select: { id: true } });
        if (!project) { res.status(403).json({ error: 'Нет доступа к проекту' }); return; }
      }

      const items = await prisma.aIArtifact.findMany({
        where: {
          userId: req.userId!,
          AND: [
            { type: { not: 'pipeline_stage' } },
            ...(type ? [{ type }] : []),
          ],
          ...(projectId ? { projectId } : {}),
          ...(workflow ? { workflow } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      res.json({ items });
    } catch (err) {
      console.error('[Artifacts] list:', err);
      res.status(500).json({ error: 'Ошибка загрузки артефактов' });
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const artifact = await getOwnedArtifact(req.userId!, req.params.id as string);
      if (!artifact) { res.status(404).json({ error: 'Артефакт не найден' }); return; }
      res.json({ artifact });
    } catch (err) {
      console.error('[Artifacts] get:', err);
      res.status(500).json({ error: 'Ошибка загрузки артефакта' });
    }
  },

  async duplicate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const source = await getOwnedArtifact(req.userId!, req.params.id as string);
      if (!source) { res.status(404).json({ error: 'Артефакт не найден' }); return; }
      const metadata = jsonObject(source.metadata);
      const versionGroupId = String(metadata.versionGroupId ?? source.id);

      const artifact = await prisma.aIArtifact.create({
        data: {
          userId: source.userId,
          projectId: source.projectId,
          workflowRunId: source.workflowRunId,
          workflowStepId: source.workflowStepId,
          generationId: source.generationId,
          workflow: source.workflow,
          step: source.step,
          type: source.type,
          title: source.title ? `${source.title} — копия` : null,
          content: source.content,
          structured: source.structured ?? undefined,
          version: source.version + 1,
          metadata: {
            ...metadata,
            versionGroupId,
            duplicatedFromArtifactId: source.id,
            versionAction: 'duplicate',
          } as Prisma.InputJsonValue,
        },
      });

      res.status(201).json({ artifact });
    } catch (err) {
      console.error('[Artifacts] duplicate:', err);
      res.status(500).json({ error: 'Ошибка дублирования артефакта' });
    }
  },

  async restore(req: AuthRequest, res: Response): Promise<void> {
    try {
      const source = await getOwnedArtifact(req.userId!, req.params.id as string);
      if (!source) { res.status(404).json({ error: 'Артефакт не найден' }); return; }
      const metadata = jsonObject(source.metadata);
      const versionGroupId = String(metadata.versionGroupId ?? source.id);

      const artifact = await prisma.aIArtifact.create({
        data: {
          userId: source.userId,
          projectId: source.projectId,
          workflowRunId: source.workflowRunId,
          workflowStepId: source.workflowStepId,
          generationId: source.generationId,
          workflow: source.workflow,
          step: source.step,
          type: source.type,
          title: source.title,
          content: source.content,
          structured: source.structured ?? undefined,
          version: source.version + 1,
          metadata: {
            ...metadata,
            versionGroupId,
            restoredFromArtifactId: source.id,
            versionAction: 'restore',
          } as Prisma.InputJsonValue,
        },
      });

      res.status(201).json({ artifact });
    } catch (err) {
      console.error('[Artifacts] restore:', err);
      res.status(500).json({ error: 'Ошибка восстановления версии' });
    }
  },

  async regenerate(req: AuthRequest, res: Response): Promise<void> {
    const parsed = regenerateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const source = await getOwnedArtifact(req.userId!, req.params.id as string);
      if (!source) { res.status(404).json({ error: 'Артефакт не найден' }); return; }
      if (!source.step) { res.status(400).json({ error: 'У артефакта нет workflow step для регенерации' }); return; }

      const sourceInputs = parsed.data.inputs
        ?? jsonObject(source.workflowStep?.input)
        ?? jsonObject(source.workflowRun?.input);

      const result = await aiWorkflowService.run({
        userId: req.userId!,
        projectId: source.projectId,
        workflow: source.workflow,
        step: source.step,
        inputs: sourceInputs,
        provider: parsed.data.provider,
        idempotencyKey: `regenerate:${source.id}:${Date.now()}`,
      });

      await prisma.aIArtifact.update({
        where: { id: result.artifactId },
        data: {
          version: source.version + 1,
          metadata: {
            versionGroupId: String(jsonObject(source.metadata).versionGroupId ?? source.id),
            regeneratedFromArtifactId: source.id,
            versionAction: 'regenerate',
          } as Prisma.InputJsonValue,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка регенерации артефакта';
      console.error('[Artifacts] regenerate:', err);
      res.status(500).json({ error: message });
    }
  },
};
