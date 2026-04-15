import { Response } from 'express';
import { z } from 'zod';
import { JTBD_FRAMEWORK, JTBDAnswers } from '../config/jtbd-framework';
import { getMockResponse } from '../config/jtbd-mock';
import { chat } from '../services/ai.service';
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
  stepId: z.number().int().min(1).max(12),
  answers: z.record(z.string()),
  model: z.enum(['chatgpt', 'claude']).default('chatgpt'),
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

    const { stepId, answers, model } = parsed.data;

    const step = JTBD_FRAMEWORK.find((s) => s.id === stepId);
    if (!step) {
      res.status(404).json({ error: `Шаг ${stepId} не найден` });
      return;
    }

    // Mock mode: no AI keys configured
    if (env.isMockAI) {
      const content = getMockResponse(stepId, answers as JTBDAnswers);
      res.json({ stepId, key: step.key, content, mock: true });
      return;
    }

    const prompt = step.buildPrompt(answers as JTBDAnswers).trim();
    const provider = model === 'chatgpt' ? 'openai' : 'anthropic';

    try {
      const result = await chat({
        provider,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2048,
        temperature: 0.7,
      });

      res.json({
        stepId,
        key: step.key,
        content: result.content,
        mock: result.mock,
      });
    } catch (err) {
      console.error('[JTBD] Error:', err);
      const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
      res.status(500).json({ error: msg });
    }
  },
};
