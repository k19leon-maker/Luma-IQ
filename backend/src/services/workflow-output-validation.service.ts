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
import type { UtpFoundation } from '../contracts/utp-foundation.contract';
import {
  UTP_FOUNDATION_KEYS,
  type UtpAiResult,
  type UtpFoundationKey,
  utpAiResultSchema,
} from '../contracts/utp-workspace.contract';

function parseJson(content: string): unknown {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(normalized);
}

function schemaFor(workflow: string, step: string): z.ZodTypeAny | null {
  if (workflow === 'strategy.utp' && ['generate', 'improve', 'final'].includes(step)) {
    return utpAiResultSchema;
  }
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

const FOUNDATION_LABELS: Record<UtpFoundationKey, string> = {
  niche: 'Ниша',
  audience: 'Аудитория',
  jtbd: 'Задача клиента',
  pains: 'Боли',
  desiredOutcome: 'Желаемый результат',
  product: 'Продукт',
  mechanism: 'Механизм',
  differentiation: 'Отличие',
  proofs: 'Доказательства',
  constraints: 'Ограничения',
};

function foundationEvidence(foundation: UtpFoundation): Map<string, { key: UtpFoundationKey; value: string }> {
  const result = new Map<string, { key: UtpFoundationKey; value: string }>();
  for (const key of UTP_FOUNDATION_KEYS) {
    const section = foundation[key];
    if ('values' in section) {
      for (const item of section.values) result.set(item.source, { key, value: item.value });
    } else if (section.status === 'ready' && section.source) {
      result.set(section.source, { key, value: section.value });
    }
  }
  return result;
}

function normalizeNumber(value: string): string {
  return value.replace(/\s/g, '').replace(',', '.').toLowerCase();
}

function extractNumbers(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)?(?:\s*[%₽])?/gu)].map((match) => normalizeNumber(match[0]));
}

const STRONG_CLAIMS: Array<{ label: string; output: RegExp; evidence: RegExp }> = [
  { label: 'гарантия результата', output: /гарант\w*/iu, evidence: /гарант\w*/iu },
  { label: 'абсолютное обещание', output: /(?:100\s*%|без\s+риска|навсегда)/iu, evidence: /(?:100\s*%|без\s+риска|навсегда)/iu },
  { label: 'лидерство или исключительность', output: /(?:№\s*1|номер\s+один|единственн\w*|лучш\w*)/iu, evidence: /(?:№\s*1|номер\s+один|единственн\w*|лучш\w*)/iu },
];

function strongClaimInput(value: string, label: string): string {
  if (label !== 'гарантия результата') return value;
  return value.replace(
    /(?:без\s+гарант\w*|не\s+(?:да[её]м|обеща[её]м|предоставля[её]м)\s+гарант\w*)/giu,
    '',
  );
}

function validateUtpGrounding(result: UtpAiResult, foundation?: UtpFoundation): ValidationResult {
  if (!foundation) return { ok: false, errors: ['UTP foundation is required for grounding validation'] };
  const errors: string[] = [];
  const sources = foundationEvidence(foundation);
  const usedSources = new Set<string>();

  for (const evidence of result.usedEvidence) {
    if (usedSources.has(evidence.source)) {
      errors.push(`usedEvidence.${evidence.source}: duplicate source`);
      continue;
    }
    usedSources.add(evidence.source);
    const actual = sources.get(evidence.source);
    if (!actual) {
      errors.push(`usedEvidence.${evidence.source}: source does not exist in UtpFoundation`);
      continue;
    }
    if (actual.key !== evidence.key) {
      errors.push(`usedEvidence.${evidence.source}: expected key ${actual.key}, got ${evidence.key}`);
    }
    if (evidence.label !== FOUNDATION_LABELS[evidence.key]) {
      errors.push(`usedEvidence.${evidence.source}: expected label ${FOUNDATION_LABELS[evidence.key]}`);
    }
  }

  const expectedMissing = new Map<UtpFoundationKey, string | null>();
  for (const key of UTP_FOUNDATION_KEYS) {
    const section = foundation[key];
    if (section.status === 'missing') expectedMissing.set(key, section.editPath);
  }
  const returnedMissing = new Map<UtpFoundationKey, UtpAiResult['missingData'][number]>();
  for (const missing of result.missingData) {
    if (returnedMissing.has(missing.key)) {
      errors.push(`missingData.${missing.key}: duplicate key`);
      continue;
    }
    returnedMissing.set(missing.key, missing);
    if (missing.label !== FOUNDATION_LABELS[missing.key]) {
      errors.push(`missingData.${missing.key}: expected label ${FOUNDATION_LABELS[missing.key]}`);
    }
    if (!expectedMissing.has(missing.key)) {
      errors.push(`missingData.${missing.key}: field is ready in UtpFoundation`);
      continue;
    }
    if (expectedMissing.get(missing.key) !== missing.editPath) {
      errors.push(`missingData.${missing.key}: editPath does not match UtpFoundation`);
    }
  }
  for (const [key] of expectedMissing) {
    if (!returnedMissing.has(key)) errors.push(`missingData.${key}: missing required entry`);
  }

  const usedCorpus = [...usedSources]
    .map((source) => sources.get(source)?.value ?? '')
    .filter(Boolean)
    .join('\n');
  const proofCorpus = [...usedSources]
    .map((source) => sources.get(source))
    .filter((entry) => entry?.key === 'proofs')
    .map((entry) => entry?.value ?? '')
    .filter(Boolean)
    .join('\n');
  const groundedNumbers = new Set(extractNumbers(usedCorpus));
  for (const number of new Set(extractNumbers(result.usp))) {
    if (!groundedNumbers.has(number)) {
      errors.push(`usp: number "${number}" is not grounded in usedEvidence`);
    }
  }
  for (const claim of STRONG_CLAIMS) {
    if (claim.output.test(strongClaimInput(result.usp, claim.label)) && !claim.evidence.test(proofCorpus)) {
      errors.push(`usp: unsupported strong claim (${claim.label})`);
    }
  }

  const usedEntries = [...usedSources]
    .map((source) => ({ source, evidence: sources.get(source) }))
    .filter((entry): entry is { source: string; evidence: { key: UtpFoundationKey; value: string } } => Boolean(entry.evidence));
  if (/(?:опыт[а-яё]*|лет\s+(?:опыта|практики)|год[а-яё]*\s+(?:опыта|практики))/iu.test(result.usp)
    && !usedEntries.some((entry) => /(?:experienceYears|achievements|credentials)/iu.test(entry.source))) {
    errors.push('usp: experience claim is not grounded in profile evidence');
  }
  if (/(?:образован[а-яё]*|сертифик[а-яё]*|диплом[а-яё]*|квалификац[а-яё]*|выпускник[а-яё]*|окончил[а-яё]*)/iu.test(result.usp)
    && !usedEntries.some((entry) => /(?:credentials|education)/iu.test(entry.source))) {
    errors.push('usp: education claim is not grounded in profile evidence');
  }
  if (/(?:кейс[а-яё]*|клиент[а-яё]*\s+(?:получил[а-яё]*|достиг[а-яё]*|увеличил[а-яё]*|снизил[а-яё]*|вырос[а-яё]*))/iu.test(result.usp)
    && !usedEntries.some((entry) => entry.source.startsWith('caseStudy:'))) {
    errors.push('usp: client result claim is not grounded in a ready case');
  }

  const timeframeMatches = [...result.usp.matchAll(/(\d+(?:[.,]\d+)?)\s*(дн[а-яё]*|недел[а-яё]*|месяц[а-яё]*|мес\.?|год[а-яё]*)/giu)];
  for (const match of timeframeMatches) {
    const rawNumber = match[1] ?? '';
    const unit = (match[2] ?? '').toLowerCase();
    if (!rawNumber || !unit) continue;
    const number = rawNumber.replace(/[.,]/g, '[.,]');
    const unitStem = unit.startsWith('дн')
      ? 'дн'
      : unit.startsWith('недел')
        ? 'недел'
        : unit.startsWith('мес')
          ? 'мес'
          : 'год';
    const evidencePattern = new RegExp(`${number}\\s*${unitStem}`, 'iu');
    if (!evidencePattern.test(usedCorpus)) {
      errors.push(`usp: timeframe "${match[0]}" is not grounded in usedEvidence`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export const workflowOutputValidationService = {
  validate(
    workflow: string,
    step: string,
    content: string,
    inputs: Record<string, unknown> = {},
    utpFoundation?: UtpFoundation,
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
        if (workflow === 'strategy.utp') {
          return validateUtpGrounding(result.data as UtpAiResult, utpFoundation);
        }
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
        : workflow === 'strategy.utp'
          ? 'Expected valid grounded UTP JSON'
        : workflow === 'tg-channel.description' || workflow === 'tg-channel'
          ? 'Expected valid Telegram channel JSON'
          : 'Expected valid Instagram JSON';
      return { ok: false, errors: [message] };
    }
  },
};
