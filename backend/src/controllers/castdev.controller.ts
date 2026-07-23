import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { CastDevTranscriptionError, transcribeCastDevRecord } from '../services/castdev-transcription.service';
import { aiWorkflowService } from '../services/ai-workflow.service';

const CAST_DEV_STATUSES = ['pending', 'transcribing', 'ready_for_analysis', 'analyzing', 'completed', 'failed'] as const;

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().url().max(2000),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(CAST_DEV_STATUSES).optional(),
  fileName: z.string().max(500).nullable().optional(),
  mimeType: z.string().max(200).nullable().optional(),
  durationSec: z.number().int().min(0).nullable().optional(),
  transcriptText: z.string().nullable().optional(),
  transcriptFormatted: z.string().nullable().optional(),
  analysis: z.record(z.unknown()).nullable().optional(),
  errorMessage: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  return project?.userId === userId;
}

function isGoogleDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['drive.google.com', 'docs.google.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function extractJsonObject(content: string): Record<string, unknown> {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(normalized.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
  }
  throw new Error('AI вернул некорректный JSON для Cast Dev');
}

function analysisIdempotencyKey(recordId: string, transcriptText: string): string {
  const hash = crypto.createHash('sha256').update(transcriptText).digest('hex');
  return `castdev.analysis:${recordId}:${hash}:v1`;
}

export const castDevController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const projectId = String(req.query.projectId ?? '');
    if (!projectId) {
      res.status(400).json({ error: 'projectId обязателен' });
      return;
    }

    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    try {
      const records = await prisma.castDevRecord.findMany({
        where: { userId: req.userId!, projectId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ records });
    } catch (err) {
      console.error('[CastDev] list:', err);
      res.status(500).json({ error: 'Ошибка при загрузке записей Cast Dev' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { projectId, title, sourceUrl } = parsed.data;
    if (!isGoogleDriveUrl(sourceUrl)) {
      res.status(400).json({ error: 'Добавьте ссылку на файл Google Drive или Google Docs' });
      return;
    }

    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    try {
      const record = await prisma.castDevRecord.create({
        data: {
          userId: req.userId!,
          projectId,
          title,
          sourceUrl,
          sourceType: 'google_drive',
          status: 'pending',
          metadata: {
            createdFrom: 'manual_google_drive_link',
            mvpStage: 'record_created',
          } as Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ record });
    } catch (err) {
      console.error('[CastDev] create:', err);
      res.status(500).json({ error: 'Ошибка при создании записи Cast Dev' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const existing = await prisma.castDevRecord.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Запись не найдена' });
        return;
      }

      const data = parsed.data;
      const record = await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.fileName !== undefined ? { fileName: data.fileName } : {}),
          ...(data.mimeType !== undefined ? { mimeType: data.mimeType } : {}),
          ...(data.durationSec !== undefined ? { durationSec: data.durationSec } : {}),
          ...(data.transcriptText !== undefined ? { transcriptText: data.transcriptText } : {}),
          ...(data.transcriptFormatted !== undefined ? { transcriptFormatted: data.transcriptFormatted } : {}),
          ...(data.analysis !== undefined ? { analysis: data.analysis as Prisma.InputJsonValue } : {}),
          ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
        },
      });
      res.json({ record });
    } catch (err) {
      console.error('[CastDev] update:', err);
      res.status(500).json({ error: 'Ошибка при обновлении записи Cast Dev' });
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const existing = await prisma.castDevRecord.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Запись не найдена' });
        return;
      }
      await prisma.castDevRecord.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[CastDev] remove:', err);
      res.status(500).json({ error: 'Ошибка при удалении записи Cast Dev' });
    }
  },

  async transcribe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const existing = await prisma.castDevRecord.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Запись не найдена' });
        return;
      }

      await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: { status: 'transcribing', errorMessage: null },
      });

      const result = await transcribeCastDevRecord(existing.sourceUrl, existing.id);
      const record = await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: {
          status: 'ready_for_analysis',
          fileName: result.fileName,
          mimeType: result.mimeType,
          durationSec: result.durationSec,
          transcriptText: result.transcriptText,
          transcriptFormatted: result.transcriptText,
          errorMessage: null,
          metadata: {
            ...(existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
              ? existing.metadata as Record<string, unknown>
              : {}),
            transcribedAt: new Date().toISOString(),
            transcriptionModel: process.env['OPENAI_TRANSCRIPTION_MODEL'] ?? 'gpt-4o-mini-transcribe',
          } as Prisma.InputJsonValue,
        },
      });

      res.json({ record });
    } catch (err) {
      console.error('[CastDev] transcribe:', err);
      const message = err instanceof CastDevTranscriptionError
        ? err.message
        : 'Не удалось распознать речь в записи. Проверьте качество звука или попробуйте другой файл.';
      const status = err instanceof CastDevTranscriptionError ? err.status : 500;
      const id = req.params.id as string;
      await prisma.castDevRecord.updateMany({
        where: { id, userId: req.userId! },
        data: { status: 'failed', errorMessage: message },
      }).catch(() => undefined);
      res.status(status).json({ error: message });
    }
  },

  async analyze(req: AuthRequest, res: Response): Promise<void> {
    try {
      const existing = await prisma.castDevRecord.findFirst({
        where: { id: req.params.id as string, userId: req.userId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Запись не найдена' });
        return;
      }
      if (!existing.transcriptText?.trim()) {
        res.status(400).json({ error: 'Сначала транскрибируйте запись' });
        return;
      }

      await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: { status: 'analyzing', errorMessage: null },
      });

      const workflowResult = await aiWorkflowService.run({
        userId: req.userId!,
        projectId: existing.projectId,
        workflow: 'castdev',
        step: 'analysis',
        inputs: {
          title: existing.title,
          sourceUrl: existing.sourceUrl,
          transcriptText: existing.transcriptText,
        },
        idempotencyKey: analysisIdempotencyKey(existing.id, existing.transcriptText),
      });

      const analysis = extractJsonObject(workflowResult.content);
      const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {};
      const formatted = typeof analysis.transcriptFormatted === 'string'
        ? analysis.transcriptFormatted
        : existing.transcriptText;

      const record = await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: {
          status: 'completed',
          transcriptFormatted: formatted,
          analysis: {
            ...analysis,
            workflowRunId: workflowResult.workflowRunId,
            workflowStepId: workflowResult.workflowStepId,
            artifactId: workflowResult.artifactId,
            generationId: workflowResult.generationId,
          } as Prisma.InputJsonValue,
          errorMessage: null,
          metadata: {
            ...metadata,
            analyzedAt: new Date().toISOString(),
            analysisWorkflowRunId: workflowResult.workflowRunId,
            analysisWorkflowStepId: workflowResult.workflowStepId,
            analysisArtifactId: workflowResult.artifactId,
            analysisGenerationId: workflowResult.generationId,
            aiPointsCharged: workflowResult.aiPointsCharged ?? 0,
            aiBalanceRemaining: workflowResult.aiBalanceRemaining ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      res.json({
        record,
        aiPointsCharged: workflowResult.aiPointsCharged ?? 0,
        aiBalanceRemaining: workflowResult.aiBalanceRemaining ?? null,
        replayed: Boolean((workflowResult as { replayed?: boolean }).replayed),
      });
    } catch (err) {
      console.error('[CastDev] analyze:', err);
      const message = err instanceof Error ? err.message : 'Не удалось выполнить AI-разбор Cast Dev';
      const id = req.params.id as string;
      await prisma.castDevRecord.updateMany({
        where: { id, userId: req.userId! },
        data: { status: 'ready_for_analysis', errorMessage: message },
      }).catch(() => undefined);
      res.status((err as { status?: number }).status ?? 500).json({ error: message });
    }
  },
};
