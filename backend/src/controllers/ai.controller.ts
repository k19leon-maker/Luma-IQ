import { Response } from 'express';
import { z } from 'zod';
import { AIProvider } from '@prisma/client';
import { chat, resolveOpenAIModel } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildProjectContext } from '../utils/buildProjectContext';
import { buildPromptForSection } from '../prompts/dynamic.prompts';
import { buildAiDialogSystemPrompt } from '../utils/buildAiDialogContext';
import { aiAccessService, AiAccessError } from '../services/ai-access.service';
import { aiGenerationService } from '../services/ai-generation.service';
import { eventService } from '../services/event.service';
import { prisma } from '../lib/prisma';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';
import { FeatureCode } from '../config/ai-economy';

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

const SECTION_FEATURES: Record<string, FeatureCode> = {
  'ai-dialog': 'ai_chat',
  positioning: 'positioning',
  audience: 'audience',
  strategy: 'positioning',
  utp: 'utp',
  social: 'social',
  'product-main': 'product_main',
  'product-mini': 'product_mini',
  'lead-magnet': 'lead_magnet',
  posts: 'post',
  reels: 'reel',
  articles: 'article',
  'video-scripts': 'video_script',
  'chatbot-chains': 'chatbot_chain',
  'content-plan': 'content_plan',
  jtbd: 'jtbd',
};

function resolveFeatureCode(section?: string): FeatureCode {
  if (!section) return 'ai_chat';
  return SECTION_FEATURES[section] ?? 'ai_chat';
}

function toDbProvider(provider: 'openai' | 'anthropic'): AIProvider {
  return provider === 'openai' ? 'OPENAI' : 'ANTHROPIC';
}

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
    const dbProvider = toDbProvider(provider);
    const resolvedModel = provider === 'anthropic'
      ? claudeModel ?? 'claude-haiku-4-5-20251001'
      : resolveOpenAIModel(section, openaiModel);
    const featureCode = resolveFeatureCode(section);

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

    const accountingStartedAt = Date.now();
    let generationId: string | null = null;
    let accountingProjectId: string | null = null;

    try {
      const accounting = await aiGenerationService.startAccounting({
        userId: req.userId!,
        projectId: projectId ?? null,
        featureCode,
        provider: dbProvider,
        model: resolvedModel,
        metadata: {
          section: section ?? null,
          requestModel: model,
          hasProjectId: Boolean(projectId),
        },
      }).catch((err) => {
        console.warn('[AI accounting] start failed:', err instanceof Error ? err.message : err);
        return null;
      });
      generationId = accounting?.generation.id ?? null;
      accountingProjectId = accounting?.generation.projectId ?? null;

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

      if (generationId) {
        await aiGenerationService.markSucceeded({
          generationId,
          userId: req.userId!,
          projectId: accountingProjectId,
          featureCode,
          provider: dbProvider,
          model: resolvedModel,
          startedAtMs: accountingStartedAt,
          isMock: result.mock,
        }).catch((err) => {
          console.warn('[AI accounting] success update failed:', err instanceof Error ? err.message : err);
        });
      }

      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider,
          section: section ?? null,
          model: resolvedModel,
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
      if (generationId) {
        await aiGenerationService.markFailed({
          generationId,
          userId: req.userId!,
          projectId: accountingProjectId,
          featureCode,
          provider: dbProvider,
          model: resolvedModel,
          startedAtMs: accountingStartedAt,
          error: err,
        }).catch((accountingErr) => {
          console.warn('[AI accounting] failed update failed:', accountingErr instanceof Error ? accountingErr.message : accountingErr);
        });
      }
      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider,
          section: section ?? null,
          model: resolvedModel,
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
