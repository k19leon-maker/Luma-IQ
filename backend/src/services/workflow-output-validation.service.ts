import type { z } from 'zod';
import { caseExtractionResultSchema, caseInsightsResultSchema } from '../schemas/case-study.schema';
import {
  instagramHighlightImproveAiResultSchema,
  instagramHighlightScenarioAiResultSchema,
  instagramHighlightsAiResultSchema,
  instagramProfileAiResultSchema,
  instagramStoryImproveAiResultSchema,
} from '../schemas/instagram-packaging.schema';
import { tgChannelDescriptionAiResultSchema } from '../schemas/tg-channel-description.schema';
import {
  tgChannelIdeaImproveAiResultSchema,
  tgChannelPlanAiResultSchema,
  tgChannelPostAiResultSchema,
} from '../schemas/tg-channel-ai.schema';
import type { ValidationResult } from './ai-validation.service';

function parseJson(content: string): unknown {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(normalized);
}

function schemaFor(workflow: string, step: string): z.ZodTypeAny | null {
  if (workflow === 'tg-channel.description' && ['generate', 'improve'].includes(step)) {
    return tgChannelDescriptionAiResultSchema;
  }
  if (workflow === 'tg-channel' && step === 'plan') return tgChannelPlanAiResultSchema;
  if (workflow === 'tg-channel' && step === 'idea-improve') return tgChannelIdeaImproveAiResultSchema;
  if (workflow === 'tg-channel' && ['post', 'edit'].includes(step)) return tgChannelPostAiResultSchema;
  if (workflow === 'instagram.highlights' && step === 'generate') {
    return instagramHighlightsAiResultSchema;
  }
  if (workflow === 'instagram.highlight' && step === 'scenario') {
    return instagramHighlightScenarioAiResultSchema;
  }
  if (workflow === 'instagram.highlight' && step === 'improve') {
    return instagramHighlightImproveAiResultSchema;
  }
  if (workflow === 'instagram.story' && step === 'improve') {
    return instagramStoryImproveAiResultSchema;
  }
  return null;
}

export const workflowOutputValidationService = {
  validate(
    workflow: string,
    step: string,
    content: string,
    inputs: Record<string, unknown> = {},
  ): ValidationResult {
    const caseSchema = workflow === 'cases'
      ? ((step === 'insights' || (step === 'final' && typeof inputs.title === 'string'))
        ? caseInsightsResultSchema
        : caseExtractionResultSchema)
      : null;
    const domainSchema = caseSchema ?? schemaFor(workflow, step);
    const profileWorkflow = workflow === 'instagram.profile' && ['generate', 'improve'].includes(step);
    if (!domainSchema && !profileWorkflow) {
      return { ok: true, errors: [] };
    }

    try {
      const parsed = parseJson(content);
      const result = (domainSchema ?? instagramProfileAiResultSchema).safeParse(parsed);
      if (result.success) {
        if (!profileWorkflow) return { ok: true, errors: [] };
        const current = inputs.currentProfile && typeof inputs.currentProfile === 'object'
          ? inputs.currentProfile as Record<string, unknown>
          : {};
        const identityErrors: string[] = [];
        for (const field of ['username', 'link'] as const) {
          const expected = typeof current[field] === 'string' ? current[field].trim() : '';
          if (result.data[field] !== expected) {
            identityErrors.push(`${field}: AI must preserve the current value`);
          }
        }
        return { ok: identityErrors.length === 0, errors: identityErrors };
      }
      return {
        ok: false,
        errors: result.error.issues.map((issue) => (
          `${issue.path.join('.') || 'result'}: ${issue.message}`
        )),
      };
    } catch {
      const message = workflow === 'cases'
        ? 'Expected valid case JSON'
        : workflow === 'tg-channel.description' || workflow === 'tg-channel'
          ? 'Expected valid Telegram channel JSON'
          : 'Expected valid Instagram JSON';
      return { ok: false, errors: [message] };
    }
  },
};
