import { caseExtractionResultSchema, caseInsightsResultSchema } from '../schemas/case-study.schema';
import { aiRuntimeService } from './ai-runtime.service';
import { caseStudyService } from './case-study.service';
import { aiGenerationService } from './ai-generation.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { modelRouterService } from './model-router.service';
import { openAIProvider } from '../providers/openai.provider';
import { env } from '../config/env';
import type { CaseExtractionCandidate } from '../schemas/case-study.schema';

function parsedContent(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(normalized);
}

const CASE_EXTRACTION_CHUNK_CHARS = 18_000;

function chunks(text: string): string[] {
  if (text.length <= CASE_EXTRACTION_CHUNK_CHARS) return [text];
  const parts = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const result: string[] = [];
  let current = '';
  for (const part of parts) {
    if (part.length > CASE_EXTRACTION_CHUNK_CHARS) {
      if (current) result.push(current);
      for (let start = 0; start < part.length; start += CASE_EXTRACTION_CHUNK_CHARS) {
        result.push(part.slice(start, start + CASE_EXTRACTION_CHUNK_CHARS));
      }
      current = '';
      continue;
    }
    const next = current ? `${current}\n\n${part}` : part;
    if (next.length > CASE_EXTRACTION_CHUNK_CHARS) {
      result.push(current);
      current = part;
    } else current = next;
  }
  if (current) result.push(current);
  return result;
}

function deduplicate(candidates: CaseExtractionCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [candidate.title, candidate.beforeText, candidate.actionsText, candidate.afterText]
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractionPrompt(sourceText: string, sourceType: string) {
  return [
    'Ты — маркетинговый редактор и аналитик клиентских кейсов Luma IQ.',
    'Выделяй самостоятельные истории и структурируй их в формате «Что было / Что сделали / Что стало».',
    'Не выдумывай факты, цифры, цитаты, действия или результаты. Не усиливай результат за пределами источника.',
    'Если данных нет, возвращай пустую строку. Не добавляй имена клиентов и юридические статусы.',
    'Верни только валидный JSON без markdown: {"cases":[{"title":"","beforeText":"","actionsText":"","afterText":"","clientTask":"","clientProblem":"","desiredResult":"","marketingInsight":""}]}.',
    'Верни все самостоятельные истории, которые есть именно в этом фрагменте. Если историй нет, верни {"cases":[]}.',
    `Источник: ${sourceType}.`,
    '',
    sourceText,
  ].join('\n');
}

export const caseStudyAiService = {
  async extract(input: {
    userId: string;
    projectId: string;
    sourceText: string;
    sourceType: 'manual' | 'voice' | 'screenshot' | 'document';
    idempotencyKey?: string;
  }) {
    await caseStudyService.assertOwnedProject(input.userId, input.projectId);
    if (input.sourceText.length > CASE_EXTRACTION_CHUNK_CHARS) {
      return this.extractLongSource(input);
    }
    const result = await aiRuntimeService.runWorkflow({
      userId: input.userId,
      projectId: input.projectId,
      workflow: 'cases',
      step: 'extract',
      inputs: {
        sourceText: input.sourceText,
        sourceType: input.sourceType,
        transcriptChars: input.sourceText.length,
      },
      idempotencyKey: input.idempotencyKey,
    });
    const candidates = caseExtractionResultSchema.parse(parsedContent(result.content)).cases;
    return {
      candidates,
      generationId: result.generationId,
      aiPointsCharged: result.aiPointsCharged,
      aiBalanceRemaining: result.aiBalanceRemaining,
    };
  },

  async extractLongSource(input: {
    userId: string;
    projectId: string;
    sourceText: string;
    sourceType: 'manual' | 'voice' | 'screenshot' | 'document';
    idempotencyKey?: string;
  }) {
    await caseStudyService.assertOwnedProject(input.userId, input.projectId);
    if (!env.OPENAI_API_KEY) {
      throw Object.assign(new Error('AI-анализ временно недоступен'), { status: 503, code: 'OPENAI_UNAVAILABLE' });
    }
    const definition = await aiActionRegistryService.resolve('cases_extract_case');
    const stage = definition.pipeline[0];
    if (!stage) throw new Error('CASE_EXTRACTION_MODEL_NOT_CONFIGURED');
    const route = await modelRouterService.routeForAttempt({ definition, stage, attemptIndex: 0 });
    if (route.provider !== 'OPENAI') throw new Error('CASE_EXTRACTION_PROVIDER_UNSUPPORTED');
    const sourceChunks = chunks(input.sourceText);
    const generation = await aiGenerationService.run({
      userId: input.userId,
      projectId: input.projectId,
      featureCode: 'cases_extract_case',
      actionKey: 'cases_extract_case',
      provider: 'OPENAI',
      model: route.actualModelId,
      idempotencyKey: input.idempotencyKey,
      promptVersion: 'cases.extract.chunked.v1',
      metadata: {
        actionKey: 'cases_extract_case',
        sourceType: input.sourceType,
        transcriptChars: input.sourceText.length,
        chunksCount: sourceChunks.length,
      },
      execute: async ({ generationId }) => {
        const collected: CaseExtractionCandidate[] = [];
        for (const [index, sourceChunk] of sourceChunks.entries()) {
          const response = await openAIProvider.chatCompletion({
            apiKey: env.OPENAI_API_KEY,
            model: route.actualModelId,
            messages: [{ role: 'user', content: extractionPrompt(sourceChunk, input.sourceType) }],
            maxTokens: Math.min(8_000, definition.outputLimit),
            temperature: 0.1,
            telemetry: {
              generationId,
              userId: input.userId,
              projectId: input.projectId,
              actionKey: 'cases_extract_case',
              pipeline: 'cases.import',
              stage: 'extract_chunk',
              promptVersion: 'cases.extract.chunked.v1',
              modelAlias: route.selectedAlias,
              modelSnapshot: route,
              retryIndex: 0,
              metadata: { sourceType: input.sourceType, chunk: index + 1, chunksCount: sourceChunks.length },
            },
          });
          collected.push(...caseExtractionResultSchema.parse(parsedContent(response.result.content)).cases);
        }
        return {
          result: { candidates: deduplicate(collected) },
          usage: { inputTokens: 0, outputTokens: 0 },
          provider: 'OPENAI' as const,
          model: route.actualModelId,
        };
      },
    });
    return {
      candidates: generation.result.candidates,
      generationId: generation.generationId,
      aiPointsCharged: generation.aiPointsCharged,
      aiBalanceRemaining: generation.aiBalanceRemaining,
    };
  },

  async generateInsights(input: {
    userId: string;
    projectId: string;
    caseId: string;
    idempotencyKey?: string;
  }) {
    const record = await caseStudyService.get(input.userId, input.projectId, input.caseId);
    const result = await aiRuntimeService.runWorkflow({
      userId: input.userId,
      projectId: input.projectId,
      workflow: 'cases',
      step: 'insights',
      inputs: {
        title: record.title,
        beforeText: record.beforeText,
        actionsText: record.actionsText,
        afterText: record.afterText,
      },
      idempotencyKey: input.idempotencyKey,
    });
    const insights = caseInsightsResultSchema.parse(parsedContent(result.content));
    const updated = await caseStudyService.update(input.userId, input.projectId, input.caseId, insights);
    return {
      case: updated,
      generationId: result.generationId,
      aiPointsCharged: result.aiPointsCharged,
      aiBalanceRemaining: result.aiBalanceRemaining,
    };
  },
};
