import { Response } from 'express';
import { z } from 'zod';
import { AIProvider, Prisma } from '@prisma/client';
import { JTBD_FRAMEWORK, JTBDAnswers } from '../config/jtbd-framework';
import { chat, resolveOpenAIModel } from '../services/ai.service';
import { jtbdSessionService } from '../services/jtbd-session.service';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { aiGenerationService } from '../services/ai-generation.service';
import { AccessPolicyError } from '../services/access-policy.service';
import { eventService } from '../services/event.service';

async function assertProjectOwner(projectId: string, userId: string, res: Response): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) { res.status(404).json({ error: 'Проект не найден' }); return false; }
  if (project.userId !== userId) { res.status(403).json({ error: 'Доступ запрещён' }); return false; }
  return true;
}

async function assertSessionOwner(sessionId: string, userId: string, res: Response): Promise<boolean> {
  const session = await prisma.jTBDSession.findUnique({
    where: { id: sessionId },
    select: { project: { select: { userId: true } } },
  });
  if (!session) { res.status(404).json({ error: 'Сессия не найдена' }); return false; }
  if (session.project.userId !== userId) { res.status(403).json({ error: 'Доступ запрещён' }); return false; }
  return true;
}

// Публичное представление шагов — без buildPrompt
const PUBLIC_STEPS = JTBD_FRAMEWORK.map(({ id, key, title, description, userQuestion }) => ({
  id,
  key,
  title,
  description,
  userQuestion,
}));

const generateSchema = z.object({
  stepId:    z.number().int().min(1).max(12),
  answers:   z.record(z.string()),
  model:     z.enum(['chatgpt', 'claude']).default('chatgpt'),
  // Опционально — для сохранения прогресса в БД
  projectId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

export const jtbdController = {
  getSteps(_req: AuthRequest, res: Response): void {
    res.json({ steps: PUBLIC_STEPS });
  },

  async generate(req: AuthRequest, res: Response): Promise<void> {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { stepId, answers, model, projectId } = parsed.data;
    let { sessionId } = parsed.data;

    const step = JTBD_FRAMEWORK.find((s) => s.id === stepId);
    if (!step) {
      res.status(404).json({ error: `Шаг ${stepId} не найден` });
      return;
    }

    // ── Получаем/создаём сессию до генерации, чтобы вернуть sessionId ──────────

    if (projectId && !sessionId) {
      if (!req.userId || !(await assertProjectOwner(projectId, req.userId, res))) return;
      try {
        const session = await jtbdSessionService.getOrCreate(projectId);
        sessionId = session.id;
      } catch (dbErr) {
        console.warn('[JTBD] Session getOrCreate failed (DB unavailable?):', (dbErr as Error).message);
      }
    } else if (sessionId) {
      if (!req.userId || !(await assertSessionOwner(sessionId, req.userId, res))) return;
    }

    // ── AI generation ─────────────────────────────────────────────────────────

    let content: string;
    let isMock: boolean;

    {
      const prompt   = step.buildPrompt(answers as JTBDAnswers).trim();
      const provider = model === 'chatgpt' ? 'openai' : 'anthropic';
      const dbProvider: AIProvider = provider === 'openai' ? 'OPENAI' : 'ANTHROPIC';
      const resolvedModel = provider === 'openai' ? resolveOpenAIModel('audience') : 'claude-haiku-4-5-20251001';

      try {
        const generation = await aiGenerationService.run({
          userId: req.userId!,
          projectId: projectId ?? null,
          featureCode: 'jtbd',
          provider: dbProvider,
          model: resolvedModel,
          metadata: { section: 'jtbd', stepId, sessionId: sessionId ?? null },
          execute: async ({ generationId }) => {
            const result = await chat({
              provider,
              messages: [{ role: 'user', content: prompt }],
              section: 'audience',
              maxTokens: 2048,
              temperature: 0.7,
              telemetry: {
                generationId,
                userId: req.userId!,
                projectId: projectId ?? null,
                actionKey: 'jtbd',
                pipeline: 'legacy.jtbd',
                stage: String(stepId),
                promptVersion: 'legacy-jtbd-runtime',
                modelAlias: 'LEGACY',
                modelSnapshot: { actualModelId: resolvedModel, source: 'legacy' },
                retryIndex: 0,
              },
            });
            return {
              result,
              usage: result.usage,
              provider: result.provider === 'anthropic' ? 'ANTHROPIC' : 'OPENAI',
              model: result.model,
            };
          },
        });
        const result = generation.result;
        content = result.content;
        isMock  = result.mock;
        void prisma.aIRequestLog.create({
          data: {
            userId: req.userId!,
            provider,
            section: 'jtbd',
            model: result.model,
            status: 'SUCCEEDED',
            isMock: result.mock,
          },
        }).catch(() => {});
        void eventService.track('ai_request_succeeded', {
          userId: req.userId!,
          metadata: { provider, section: 'jtbd', stepId, mock: result.mock },
        }).catch(() => {});
      } catch (err) {
        console.error('[JTBD] AI error:', err);
        void prisma.aIRequestLog.create({
          data: {
            userId: req.userId!,
            provider,
            section: 'jtbd',
            model: resolvedModel,
            status: 'FAILED',
            error: err instanceof Error ? err.message : 'unknown',
          },
        }).catch(() => {});
        void eventService.track('ai_request_failed', {
          userId: req.userId!,
          metadata: { provider, section: 'jtbd', stepId, error: err instanceof Error ? err.message : 'unknown' },
        }).catch(() => {});
        if (err instanceof AccessPolicyError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        if (typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
          res.status((err as { status: number }).status).json({ error: err instanceof Error ? err.message : 'Ошибка AI-сервиса' });
          return;
        }
        res.status(503).json({ error: 'Неполадки со связью. Попробуйте обновить страницу.' });
        return;
      }
    }

    // ── Сохраняем ответы в БД (fire-and-forget, не блокирует ответ) ───────────

    if (sessionId) {
      const capturedSessionId = sessionId;
      const updatedAnswers = { ...answers, [step.key]: content };
      void jtbdSessionService
        .saveStep(capturedSessionId, stepId, updatedAnswers)
        .catch((dbErr: Error) =>
          console.warn('[JTBD] DB save failed (DB unavailable?):', dbErr.message),
        );
    }

    res.json({
      stepId,
      key:       step.key,
      content,
      mock:      isMock,
      sessionId,
    });
  },

  async getByProject(req: AuthRequest, res: Response): Promise<void> {
    const { projectId } = req.params as { projectId: string };
    if (!req.userId || !(await assertProjectOwner(projectId, req.userId, res))) return;
    try {
      const session = await prisma.jTBDSession.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, answers: true, currentStep: true, status: true },
      });
      res.json({ session: session ?? null });
    } catch (err) {
      console.error('[JTBD] getByProject:', err);
      res.status(500).json({ error: 'Ошибка при загрузке сессии' });
    }
  },

  async save(req: AuthRequest, res: Response): Promise<void> {
    const { projectId, answers, currentStep } = req.body as {
      projectId?: string;
      answers: Record<string, string>;
      currentStep?: number;
    };
    if (!projectId) { res.status(400).json({ error: 'projectId обязателен' }); return; }
    if (!req.userId || !(await assertProjectOwner(projectId, req.userId, res))) return;
    try {
      const session = await jtbdSessionService.getOrCreate(projectId);
      await prisma.jTBDSession.update({
        where: { id: session.id },
        data: {
          answers: answers as Prisma.InputJsonValue,
          currentStep: currentStep ?? session.currentStep,
        },
      });
      res.json({ ok: true, sessionId: session.id });
    } catch (err) {
      console.error('[JTBD] save:', err);
      res.status(500).json({ error: 'Ошибка при сохранении' });
    }
  },
};
