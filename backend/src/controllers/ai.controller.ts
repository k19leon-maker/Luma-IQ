import { Response } from 'express';
import { z } from 'zod';
import { AIProvider } from '@prisma/client';
import { chat, resolveOpenAIModel } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildProjectContext } from '../utils/buildProjectContext';
import { buildPromptForSection } from '../prompts/dynamic.prompts';
import { buildAiDialogSystemPrompt } from '../utils/buildAiDialogContext';
import { aiGenerationService } from '../services/ai-generation.service';
import { aiWorkflowService } from '../services/ai-workflow.service';
import { AccessPolicyError } from '../services/access-policy.service';
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
  idempotencyKey: z.string().max(200).optional(),
});

const aboutSummarySchema = z.object({
  projectId: z.string().uuid(),
  model: z.enum(['chatgpt', 'claude']).optional().default('chatgpt'),
  openaiModel: z.string().optional(),
  claudeModel: z.string().optional(),
  profile: z.object({
    whoYouAre: z.string().max(6000).optional(),
    targetAudience: z.string().max(6000).optional(),
    productsAndServices: z.string().max(6000).optional(),
    expertiseAndStrengths: z.string().max(6000).optional(),
    trustProofs: z.string().max(6000).optional(),
    name: z.string().max(1000).optional(),
    experienceYears: z.string().max(1000).optional(),
    workFormats: z.string().max(4000).optional(),
    antiPreferences: z.string().max(4000).optional(),
    credentials: z.string().max(4000).optional(),
    uploadedFileText: z.string().max(12000).optional(),
  }).passthrough(),
  idempotencyKey: z.string().max(200).optional(),
});

const SECTION_FEATURES: Record<string, FeatureCode> = {
  'ai-dialog': 'ai_chat',
  'about-ai-summary': 'about_ai_summary',
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

function responseProviderToDb(provider: 'openai' | 'anthropic' | 'gemini' | 'grok'): AIProvider {
  if (provider === 'openai') return 'OPENAI';
  if (provider === 'anthropic') return 'ANTHROPIC';
  if (provider === 'gemini') return 'GEMINI';
  return 'GROK';
}

function compactAiSummary(content: string): string {
  const normalized = content.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= 1500) return normalized;
  const truncated = normalized.slice(0, 1500);
  const sentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
  return (sentenceEnd > 900 ? truncated.slice(0, sentenceEnd + 1) : truncated).trim();
}

export const aiController = {
  async aboutSummary(req: AuthRequest, res: Response): Promise<void> {
    const parsed = aboutSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { projectId, profile, model, openaiModel, claudeModel, idempotencyKey } = parsed.data;
    const hasSource = Object.values(profile).some((value) => typeof value === 'string' && value.trim());

    if (!hasSource) {
      res.status(400).json({ error: 'Заполните несколько полей перед AI-улучшением' });
      return;
    }

    try {
      const workflow = await aiWorkflowService.run({
        userId: req.userId!,
        projectId,
        workflow: 'strategy.about',
        step: 'summary',
        provider: model,
        openaiModel,
        claudeModel,
        idempotencyKey: idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
        inputs: { profile, source: 'legacy-about-summary' },
      });

      const content = compactAiSummary(workflow.content);
      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider: workflow.provider,
          section: 'about-ai-summary',
          model: workflow.model,
          status: 'SUCCEEDED',
          isMock: workflow.mock,
        },
      }).catch(() => {});

      res.json({
        summary: content,
        mock: workflow.mock,
        workflowRunId: workflow.workflowRunId,
        workflowStepId: workflow.workflowStepId,
        artifactId: workflow.artifactId,
        generationId: workflow.generationId,
        aiPointsCharged: workflow.aiPointsCharged,
        aiBalanceRemaining: workflow.aiBalanceRemaining,
      });
    } catch (err) {
      console.error('[AI about summary] Error:', err);
      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider: model,
          section: 'about-ai-summary',
          model: model === 'claude' ? claudeModel ?? null : openaiModel ?? null,
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'unknown',
        },
      }).catch(() => {});
      if (err instanceof AccessPolicyError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
          limitType: err.limitType,
          current: err.current,
          limit: err.limit,
          planId: err.planId,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
      res.status(500).json({ error: msg });
    }
  },

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
      idempotencyKey,
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

    if (projectId) {
      try {
        const workflow = await aiWorkflowService.run({
          userId: req.userId!,
          projectId,
          workflow: 'ai.dialog',
          step: 'message',
          provider: model,
          openaiModel,
          claudeModel,
          idempotencyKey: idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
          inputs: {
            message,
            history: conversationHistory,
            section: section ?? 'ai-dialog',
            fileContext: fileContext ?? '',
            projectName: projectName ?? '',
            source: 'legacy-ai-chat',
          },
        });
        res.json({
          content: workflow.content,
          mock: workflow.mock,
          workflowRunId: workflow.workflowRunId,
          workflowStepId: workflow.workflowStepId,
          artifactId: workflow.artifactId,
          generationId: workflow.generationId,
          aiPointsCharged: workflow.aiPointsCharged,
          aiBalanceRemaining: workflow.aiBalanceRemaining,
        });
        return;
      } catch (err) {
        console.error('[AI workflow chat] Error:', err);
        if (err instanceof AccessPolicyError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        if (typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
          res.status((err as { status: number }).status).json({ error: err instanceof Error ? err.message : 'Ошибка AI-сервиса' });
          return;
        }
        res.status(500).json({ error: err instanceof Error ? err.message : 'Ошибка AI-сервиса' });
        return;
      }
    }

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
      const generation = await aiGenerationService.run({
        userId: req.userId!,
        projectId: projectId ?? null,
        featureCode,
        provider: dbProvider,
        model: resolvedModel,
        idempotencyKey: idempotencyKey ?? (req.header('idempotency-key') || req.header('x-idempotency-key') || undefined),
        metadata: {
          section: section ?? null,
          requestModel: model,
          hasProjectId: Boolean(projectId),
        },
        execute: async () => {
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
          return {
            result,
            usage: result.usage,
            provider: responseProviderToDb(result.provider),
            model: result.model,
          };
        },
      });
      const result = generation.result;

      void prisma.aIRequestLog.create({
        data: {
          userId: req.userId!,
          provider,
          section: section ?? null,
          model: result.model,
          status: 'SUCCEEDED',
          isMock: result.mock,
        },
      }).catch(() => {});
      void eventService.track('ai_request_succeeded', {
        userId: req.userId!,
        metadata: { provider: result.provider, section, mock: result.mock, model: result.model, usage: result.usage },
      }).catch(() => {});

      res.json({
        content: result.content,
        mock: result.mock,
        generationId: generation.generationId,
        aiPointsCharged: generation.aiPointsCharged,
        aiBalanceRemaining: generation.aiBalanceRemaining,
      });
    } catch (err) {
      console.error('[AI] Error:', err);
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
      if (err instanceof AccessPolicyError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
          limitType: err.limitType,
          current: err.current,
          limit: err.limit,
          planId: err.planId,
        });
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
        res.status((err as { status: number }).status).json({ error: err instanceof Error ? err.message : 'Ошибка AI-сервиса' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Ошибка AI-сервиса';
      res.status(500).json({ error: msg });
    }
  },
};
