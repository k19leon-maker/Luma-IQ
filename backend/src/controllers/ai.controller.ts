import { Response } from 'express';
import { z } from 'zod';
import { chat } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildProjectContext } from '../utils/buildProjectContext';
import { buildPromptForSection } from '../prompts/dynamic.prompts';

const chatSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.enum(['chatgpt', 'claude']),
  claudeModel: z.string().optional(),
  section: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
  // Dynamic prompt context
  unpackingProfile: z.record(z.string()).optional(),
  projectName: z.string().optional(),
  fileContext: z.string().optional(),
});

export const aiController = {
  async chat(req: AuthRequest, res: Response): Promise<void> {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const {
      message,
      model,
      claudeModel,
      section,
      conversationHistory,
      unpackingProfile,
      projectName,
      fileContext,
    } = parsed.data;

    const provider = model === 'chatgpt' ? 'openai' : 'anthropic';

    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message },
    ];

    // Build system prompt: dynamic if profile provided, static from SYSTEM_PROMPTS otherwise
    let systemPrompt: string | undefined;
    if (section) {
      const ctx = buildProjectContext(unpackingProfile ?? null, projectName ?? '');
      console.log(`[AI] section=${section} project="${ctx.projectName}" spec="${ctx.specialization.slice(0, 60)}"`);
      systemPrompt = buildPromptForSection(section, ctx);
      // Append file context if provided
      if (fileContext?.trim()) {
        systemPrompt += `\n\nДополнительный контекст от эксперта:\n${fileContext.trim()}`;
      }
    }

    try {
      const result = await chat({
        provider,
        messages,
        section,
        claudeModel,
        systemPrompt,
        maxTokens: 2048,
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
