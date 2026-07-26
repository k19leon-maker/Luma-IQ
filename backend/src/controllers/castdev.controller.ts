import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { getCastDevAnalysisCost } from '../config/ai-actions';
import { AuthRequest } from '../middleware/auth.middleware';
import { castDevTranscriptionQueueService } from '../services/castdev-transcription-queue.service';
import { aiRuntimeService } from '../services/ai-runtime.service';

const CAST_DEV_STATUSES = ['pending', 'queued', 'transcribing', 'ready_for_analysis', 'analyzing', 'completed', 'failed'] as const;

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

const transcribeSchema = z.object({
  mode: z.enum(['mini', 'diarize']).default('mini'),
});

const synthesisSchema = z.object({
  projectId: z.string().uuid(),
  recordIds: z.array(z.string().uuid()).refine(
    (ids) => [5, 10, 20].includes(new Set(ids).size),
    'Для синтеза выберите ровно 5, 10 или 20 интервью',
  ),
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
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'drive.google.com'
      || hostname === 'docs.google.com'
      || hostname === 'drive.usercontent.google.com'
      || hostname.endsWith('.googleusercontent.com');
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
  throw new Error('AI вернул некорректный JSON для CustDev');
}

function analysisIdempotencyKey(recordId: string, transcriptText: string): string {
  const hash = crypto.createHash('sha256').update(transcriptText).digest('hex');
  return `castdev.analysis:${recordId}:${hash}:v1`;
}

function synthesisIdempotencyKey(records: Array<{ id: string; updatedAt: Date }>): string {
  const source = records
    .map((record) => `${record.id}:${record.updatedAt.toISOString()}`)
    .sort()
    .join('|');
  return `castdev.synthesis:${crypto.createHash('sha256').update(source).digest('hex')}:v1`;
}

function compactAnalysis(record: {
  id: string;
  title: string;
  analysis: Prisma.JsonValue | null;
}): Record<string, unknown> {
  const analysis = record.analysis && typeof record.analysis === 'object' && !Array.isArray(record.analysis)
    ? record.analysis as Record<string, unknown>
    : {};
  const compactItems = (value: unknown) => Array.isArray(value)
    ? value.slice(0, 30).map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      return {
        title: typeof source.title === 'string' ? source.title : '',
        type: typeof source.type === 'string' ? source.type : undefined,
        quote: typeof source.quote === 'string' ? source.quote.slice(0, 500) : '',
      };
    }).filter(Boolean)
    : [];
  return {
    recordId: record.id,
    title: record.title,
    summary: typeof analysis.summaryForContext === 'string'
      ? analysis.summaryForContext.slice(0, 2000)
      : '',
    customerTasks: compactItems(analysis.customerTasks),
    fearsProblemsObjections: compactItems(analysis.fearsProblemsObjections),
    desiresGoalsResults: compactItems(analysis.desiresGoalsResults),
  };
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
      res.status(500).json({ error: 'Ошибка при загрузке записей CustDev' });
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
      res.status(400).json({ error: 'Добавьте ссылку на файл Google Drive' });
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
      res.status(500).json({ error: 'Ошибка при создании записи CustDev' });
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
      res.status(500).json({ error: 'Ошибка при обновлении записи CustDev' });
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
      res.status(500).json({ error: 'Ошибка при удалении записи CustDev' });
    }
  },

  async transcribe(req: AuthRequest, res: Response): Promise<void> {
    const parsed = transcribeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const record = await castDevTranscriptionQueueService.enqueue({
        userId: req.userId!,
        recordId: req.params.id as string,
        mode: parsed.data.mode,
      });
      res.json({ record, queued: true });
    } catch (err) {
      console.error('[CastDev] transcribe:', err);
      const message = err instanceof Error ? err.message : 'Не удалось поставить запись в очередь транскрибации';
      res.status((err as { status?: number }).status ?? 500).json({ error: message });
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
      const analysisCost = getCastDevAnalysisCost(existing.transcriptText.length);

      await prisma.castDevRecord.update({
        where: { id: existing.id },
        data: { status: 'analyzing', errorMessage: null },
      });

      const workflowResult = await aiRuntimeService.runWorkflow({
        userId: req.userId!,
        projectId: existing.projectId,
        workflow: 'castdev',
        step: 'analysis',
        inputs: {
          title: existing.title,
          sourceUrl: existing.sourceUrl,
          transcriptText: existing.transcriptText,
          transcriptChars: existing.transcriptText.length,
          castdevAiPoints: analysisCost,
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
            analysisTranscriptChars: existing.transcriptText.length,
            analysisEstimatedAiPoints: analysisCost,
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
      const message = err instanceof Error ? err.message : 'Не удалось выполнить AI-разбор CustDev';
      const id = req.params.id as string;
      await prisma.castDevRecord.updateMany({
        where: { id, userId: req.userId! },
        data: { status: 'ready_for_analysis', errorMessage: message },
      }).catch(() => undefined);
      res.status((err as { status?: number }).status ?? 500).json({ error: message });
    }
  },

  async listSyntheses(req: AuthRequest, res: Response): Promise<void> {
    const projectId = String(req.query.projectId ?? '');
    if (!projectId) {
      res.status(400).json({ error: 'projectId обязателен' });
      return;
    }
    if (!(await assertProjectOwner(req.userId!, projectId))) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }
    const artifacts = await prisma.aIArtifact.findMany({
      where: {
        userId: req.userId!,
        projectId,
        workflow: 'castdev.synthesis',
        type: 'castdev_synthesis',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        content: true,
        structured: true,
        metadata: true,
        workflowRunId: true,
        generationId: true,
        createdAt: true,
      },
    });
    res.json({ syntheses: artifacts });
  },

  async synthesize(req: AuthRequest, res: Response): Promise<void> {
    const parsed = synthesisSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { projectId } = parsed.data;
    const recordIds = [...new Set(parsed.data.recordIds)];
    if (!(await assertProjectOwner(req.userId!, projectId))) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    try {
      const records = await prisma.castDevRecord.findMany({
        where: {
          id: { in: recordIds },
          userId: req.userId!,
          projectId,
          status: 'completed',
        },
        select: {
          id: true,
          title: true,
          analysis: true,
          updatedAt: true,
        },
      });
      if (records.length !== recordIds.length) {
        res.status(400).json({
          error: 'Для синтеза доступны только ваши завершённые интервью с готовым AI-разбором',
        });
        return;
      }
      const reports = records.map(compactAnalysis);
      const result = await aiRuntimeService.runWorkflow({
        userId: req.userId!,
        projectId,
        workflow: 'castdev.synthesis',
        step: 'generate',
        inputs: {
          recordIds,
          recordsCount: records.length,
          reports: JSON.stringify(reports),
        },
        idempotencyKey: synthesisIdempotencyKey(records),
      });
      const synthesis = extractJsonObject(result.content);
      res.json({
        synthesis: {
          id: result.artifactId,
          title: `Синтез ${records.length} интервью`,
          content: result.content,
          structured: synthesis,
          workflowRunId: result.workflowRunId,
          generationId: result.generationId,
          createdAt: new Date().toISOString(),
        },
        aiPointsCharged: result.aiPointsCharged ?? 0,
        aiBalanceRemaining: result.aiBalanceRemaining ?? null,
        replayed: Boolean((result as { replayed?: boolean }).replayed),
      });
    } catch (err) {
      console.error('[CastDev] synthesize:', err);
      const message = err instanceof Error ? err.message : 'Не удалось выполнить синтез CustDev';
      res.status((err as { status?: number }).status ?? 500).json({ error: message });
    }
  },
};
