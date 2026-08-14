import { env } from '../config/env';
import { aiGenerationService } from './ai-generation.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { modelRouterService } from './model-router.service';
import { openAIProvider } from '../providers/openai.provider';

function outputText(response: unknown): string {
  if (response && typeof response === 'object' && typeof (response as { output_text?: unknown }).output_text === 'string') {
    return (response as { output_text: string }).output_text.trim();
  }
  return '';
}

export const caseStudyOcrService = {
  async recognize(input: {
    userId: string;
    projectId: string;
    sources: Array<{ fileName: string; mimeType: string; buffer: Buffer }>;
    kind?: 'screenshots' | 'pdf_scan';
    idempotencyKey?: string;
  }) {
    if (!env.OPENAI_API_KEY) throw Object.assign(new Error('OCR временно недоступен'), { status: 503, code: 'OPENAI_UNAVAILABLE' });
    const definition = await aiActionRegistryService.resolve('cases_extract_case');
    const stage = definition.pipeline[0];
    if (!stage) throw new Error('CASE_OCR_MODEL_NOT_CONFIGURED');
    const route = await modelRouterService.routeForAttempt({ definition, stage, attemptIndex: 0 });
    if (route.provider !== 'OPENAI') throw new Error('CASE_OCR_PROVIDER_UNSUPPORTED');
    const generation = await aiGenerationService.run({
      userId: input.userId,
      projectId: input.projectId,
      featureCode: 'cases_extract_case',
      actionKey: 'cases_extract_case',
      provider: 'OPENAI',
      model: route.actualModelId,
      idempotencyKey: input.idempotencyKey,
      promptVersion: 'cases.ocr.v1',
      metadata: {
        actionKey: 'cases_extract_case',
        transcriptChars: input.sources.length * (input.kind === 'pdf_scan' ? 20_000 : 10_000),
        sourceKind: input.kind ?? 'screenshots',
        sourceCount: input.sources.length,
      },
      execute: async ({ generationId }) => {
        const content: Array<Record<string, string>> = [{
          type: 'input_text',
          text: 'Распознай весь читаемый русский и английский текст в загруженных материалах. Сохрани структуру историй клиентов, но не делай маркетинговых выводов и не добавляй факты. Верни только распознанный текст, без комментариев.',
        }];
        for (const source of input.sources) {
          const data = source.buffer.toString('base64');
          if (source.mimeType === 'application/pdf') {
            content.push({
              type: 'input_file',
              filename: source.fileName,
              file_data: `data:application/pdf;base64,${data}`,
            });
          } else {
            content.push({ type: 'input_image', image_url: `data:${source.mimeType};base64,${data}` });
          }
        }
        const response = await openAIProvider.responses({
          apiKey: env.OPENAI_API_KEY,
          model: route.actualModelId,
          request: { model: route.actualModelId, input: [{ role: 'user', content }], max_output_tokens: 24_000 },
          telemetry: {
            generationId,
            userId: input.userId,
            projectId: input.projectId,
            actionKey: 'cases_extract_case',
            pipeline: 'cases.ocr',
            stage: 'recognize_screenshots',
            promptVersion: 'cases.ocr.v1',
            modelAlias: route.selectedAlias,
            modelSnapshot: route,
            retryIndex: 0,
            metadata: { sourceKind: input.kind ?? 'screenshots', sourceCount: input.sources.length },
          },
        });
        const text = outputText(response.result);
        if (!text) throw Object.assign(new Error('На скриншотах не удалось распознать текст'), { status: 422, code: 'CASE_OCR_EMPTY' });
        return { result: { text }, usage: response.usage, provider: 'OPENAI' as const, model: route.actualModelId };
      },
    });
    return {
      text: generation.result.text,
      generationId: generation.generationId,
      aiPointsCharged: generation.aiPointsCharged,
      aiBalanceRemaining: generation.aiBalanceRemaining,
    };
  },
};
