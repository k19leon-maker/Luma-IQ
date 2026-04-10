import { Response } from 'express';
import { z } from 'zod';
import { chat } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  model: z.enum(['chatgpt', 'claude']),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
});

const JTBD_SYSTEM_PROMPT = `Ты — AI-ассистент для маркетинговой упаковки психологов по JTBD-фреймворку.
Твоя цель — провести психолога через 6 шагов:
1. Сегмент ЦА — определить идеального клиента
2. Боли — выявить глубинные проблемы клиента
3. JTBD-работы — сформулировать Jobs To Be Done
4. УТП — сформировать уникальное торговое предложение
5. Оффер — создать конкретное предложение
6. Контент — предложить контент-стратегию

Общайся на русском языке. Задавай по одному конкретному вопросу за раз. Будь структурированным, но дружелюбным.
Когда пользователь отвечает на вопрос, делай краткое резюме его ответа, а затем задавай следующий вопрос.`;

export const aiController = {
  async chat(req: AuthRequest, res: Response): Promise<void> {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { message, model, conversationHistory } = parsed.data;

    const provider = model === 'chatgpt' ? 'openai' : 'anthropic';

    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message },
    ];

    try {
      const result = await chat({
        provider,
        messages,
        systemPrompt: JTBD_SYSTEM_PROMPT,
        maxTokens: 1024,
        temperature: 0.7,
      });

      res.json({ content: result.content, mock: result.mock });
    } catch (err) {
      console.error('[AI] Error:', err);
      const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
      res.status(500).json({ error: msg });
    }
  },
};
