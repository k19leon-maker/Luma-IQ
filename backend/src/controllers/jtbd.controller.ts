import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { JTBD_FRAMEWORK, JTBDAnswers } from '../config/jtbd-framework';
import { getMockResponse } from '../config/jtbd-mock';
import { chat } from '../services/ai.service';
import { jtbdSessionService } from '../services/jtbd-session.service';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

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
      try {
        const session = await jtbdSessionService.getOrCreate(projectId);
        sessionId = session.id;
      } catch (dbErr) {
        console.warn('[JTBD] Session getOrCreate failed (DB unavailable?):', (dbErr as Error).message);
      }
    }

    // ── AI generation ─────────────────────────────────────────────────────────

    let content: string;
    let isMock: boolean;

    if (env.isMockAI) {
      content = getMockResponse(stepId, answers as JTBDAnswers);
      isMock  = true;
    } else {
      const prompt   = step.buildPrompt(answers as JTBDAnswers).trim();
      const provider = model === 'chatgpt' ? 'openai' : 'anthropic';

      try {
        const result = await chat({
          provider,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 2048,
          temperature: 0.7,
        });
        content = result.content;
        isMock  = result.mock;
      } catch (err) {
        console.error('[JTBD] AI error:', err);
        const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
        res.status(500).json({ error: msg });
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
