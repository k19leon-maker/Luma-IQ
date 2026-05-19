import { Response } from 'express';
import { z } from 'zod';
import { chat, resolveOpenAIModel } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildProjectContext } from '../utils/buildProjectContext';
import { buildPromptForSection } from '../prompts/dynamic.prompts';
import { buildAiDialogSystemPrompt } from '../utils/buildAiDialogContext';
import { aiAccessService, AiAccessError } from '../services/ai-access.service';
import { eventService } from '../services/event.service';
import { prisma } from '../lib/prisma';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';

const chatSchema = z.object({
  message: z.string().min(1).max(24000),
  model: z.enum(['chatgpt', 'claude']),
  openaiModel: z.string().optional(),
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
  projectId: z.string().uuid().optional(),
  fileContext: z.string().optional(),
  maxTokens: z.number().int().min(256).max(8000).optional(),
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
      openaiModel,
      claudeModel,
      section,
      conversationHistory,
      unpackingProfile,
      projectName,
      projectId,
      fileContext,
      maxTokens,
    } = parsed.data;

    const provider = model === 'chatgpt' ? 'openai' : 'anthropic';

    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message },
    ];

    // Build system prompt: dynamic if profile provided, static from SYSTEM_PROMPTS otherwise
    let systemPrompt: string | undefined;
    if (section === 'ai-dialog' && projectId) {
      try {
        const prompt = await buildAiDialogSystemPrompt(req.userId!, projectId);
        if (!prompt) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[AI dialog] Project context unavailable in dev, using generic prompt');
          } else {
            res.status(404).json({ error: 'Проект не найден' });
            return;
          }
        } else {
          systemPrompt = prompt;
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AI dialog] DB context unavailable in dev, using generic prompt:', (err as Error).message);
        } else {
          throw err;
        }
      }
      if (fileContext?.trim()) {
        systemPrompt = [systemPrompt, `Дополнительный контекст от пользователя:\n${fileContext.trim()}`]
          .filter(Boolean)
          .join('\n\n');
      }
    } else if (section) {
      const ctx = buildProjectContext(unpackingProfile ?? null, projectName ?? '');
      console.log(`[AI] section=${section} project="${ctx.projectName}" spec="${ctx.specialization.slice(0, 60)}"`);
      systemPrompt = buildPromptForSection(section, ctx);
      // Append file context if provided
      if (fileContext?.trim()) {
        systemPrompt += `\n\nДополнительный контекст от эксперта:\n${fileContext.trim()}`;
      }
    }
    if (systemPrompt) {
      systemPrompt = withGlobalAiBehaviorPrompt(systemPrompt);
    }

    try {
      await aiAccessService.consume(req.userId!);

      const result = await chat({
        provider,
        messages,
        section,
        openaiModel,
        claudeModel,
        systemPrompt,
        maxTokens: maxTokens ?? (section === 'product-main' ? 6000 : 2048),
        temperature: 0.7,
      });

      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider,
          section: section ?? null,
          model: provider === 'anthropic' ? claudeModel ?? null : resolveOpenAIModel(section, openaiModel),
          status: 'SUCCEEDED',
          isMock: result.mock,
        },
      }).catch(() => {});
      void eventService.track('ai_request_succeeded', {
        userId: req.userId!,
        metadata: { provider, section, mock: result.mock },
      }).catch(() => {});

      res.json({ content: result.content, mock: result.mock });
    } catch (err) {
      console.error('[AI] Error:', err);
      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider,
          section: section ?? null,
          model: provider === 'anthropic' ? claudeModel ?? null : resolveOpenAIModel(section, openaiModel),
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'unknown',
        },
      }).catch(() => {});
      void eventService.track('ai_request_failed', {
        userId: req.userId!,
        metadata: { provider, section, error: err instanceof Error ? err.message : 'unknown' },
      }).catch(() => {});
      if (err instanceof AiAccessError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
      res.status(500).json({ error: msg });
    }
  },
};
