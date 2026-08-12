import fs from 'fs';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { openAIProvider } from '../providers/openai.provider';
import { aiGenerationService } from './ai-generation.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { audioFileInspectionService } from './audio-file-inspection.service';
import { modelRouterService } from './model-router.service';
import type { AIActionKey } from '../config/ai-action-registry';
import type { FeatureCode } from '../config/ai-economy';

const MAX_VOICE_DURATION_SECONDS = 5 * 60;

export class AudioTranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { status?: unknown; code?: unknown };
  const status = typeof details.status === 'number' ? details.status : 0;
  return status === 408 || status === 409 || status === 429 || status >= 500
    || details.code === 'ECONNRESET'
    || details.code === 'ETIMEDOUT';
}

async function waitForStream(file: fs.ReadStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    file.once('open', () => resolve());
    file.once('error', reject);
  });
}

export const audioTranscriptionService = {
  async transcribe(input: {
    userId: string;
    filePath: string;
    fileSize: number;
    claimedMimeType: string;
    requestId: string;
    projectId?: string;
    purpose?: 'voice-input' | 'cases';
  }): Promise<{
    text: string;
    durationSec: number;
    format: string;
    generationId: string;
    aiPointsCharged: number;
    aiBalanceRemaining: number;
  }> {
    if (!env.OPENAI_API_KEY) {
      throw new AudioTranscriptionError(
        'Транскрибация временно недоступна',
        'AUDIO_TRANSCRIPTION_UNAVAILABLE',
        503,
      );
    }

    const inspected = await audioFileInspectionService.inspect(input.filePath);
    if (inspected.durationSec > MAX_VOICE_DURATION_SECONDS + 1) {
      throw new AudioTranscriptionError(
        'Голосовое сообщение не должно быть длиннее 5 минут',
        'AUDIO_DURATION_EXCEEDED',
        413,
      );
    }

    const normalizedPath = `${input.filePath}.${inspected.format === 'mp4' ? 'm4a' : inspected.format}`;
    await fs.promises.rename(input.filePath, normalizedPath);

    try {
      const isCases = input.purpose === 'cases';
      const featureCode: FeatureCode = isCases ? 'cases_voice_transcription' : 'audio_transcription';
      const actionKey: AIActionKey = isCases ? 'cases_voice_transcription' : 'audio_transcription';
      const definition = await aiActionRegistryService.resolve(actionKey);
      const stage = definition.pipeline[0];
      if (!stage) {
        throw new AudioTranscriptionError(
          'Модель транскрибации не настроена',
          'AUDIO_MODEL_NOT_CONFIGURED',
          503,
        );
      }
      const initialRoute = await modelRouterService.routeForAttempt({ definition, stage, attemptIndex: 0 });
      if (initialRoute.provider !== 'OPENAI') {
        throw new AudioTranscriptionError(
          'Для голосового ввода должен быть настроен OpenAI',
          'AUDIO_PROVIDER_UNSUPPORTED',
          503,
        );
      }

      const metadata = {
        source: isCases ? 'cases' : 'voice-input',
        operation: 'transcription',
        durationSec: Math.round(inspected.durationSec),
        sizeBytes: input.fileSize,
        claimedMimeType: input.claimedMimeType,
        detectedFormat: inspected.format,
        requestId: input.requestId,
        modelAlias: initialRoute.selectedAlias,
        modelId: initialRoute.actualModelId,
        purpose: input.purpose ?? 'voice-input',
        ...(input.projectId ? { projectId: input.projectId } : {}),
      } satisfies Prisma.InputJsonObject;

      const generation = await aiGenerationService.run({
        userId: input.userId,
        projectId: input.projectId,
        featureCode,
        actionKey,
        provider: 'OPENAI',
        model: initialRoute.actualModelId,
        promptVersion: 'not-applicable',
        metadata,
        execute: async ({ generationId }) => {
          let lastError: unknown;
          for (let attemptIndex = 0; attemptIndex < definition.retryPolicy.maxAttempts; attemptIndex += 1) {
            const route = attemptIndex === 0
              ? initialRoute
              : await modelRouterService.routeForAttempt({ definition, stage, attemptIndex });
            if (route.provider !== 'OPENAI') {
              throw new AudioTranscriptionError(
                'Для голосового ввода должен быть настроен OpenAI',
                'AUDIO_PROVIDER_UNSUPPORTED',
                503,
              );
            }
            try {
              const file = fs.createReadStream(normalizedPath);
              try {
                await waitForStream(file);
                const result = await openAIProvider.transcribe({
                  apiKey: env.OPENAI_API_KEY,
                  model: route.actualModelId,
                  file,
                  language: env.OPENAI_TRANSCRIPTION_LANGUAGE,
                  telemetry: {
                    generationId,
                    userId: input.userId,
                    correlationId: input.requestId,
                    actionKey,
                    pipeline: isCases ? 'cases' : 'voice-input',
                    stage: 'transcription',
                    promptVersion: 'not-applicable',
                    modelAlias: route.selectedAlias,
                    modelSnapshot: {
                      actualModelId: route.actualModelId,
                      source: route.profileSource,
                      versionId: route.profileVersionId,
                    },
                    retryIndex: attemptIndex,
                    metadata,
                  },
                });
                const transcript = result.result.text.trim();
                if (!transcript) {
                  throw new AudioTranscriptionError(
                    'Не удалось распознать голосовое сообщение',
                    'AUDIO_TRANSCRIPTION_EMPTY',
                    422,
                  );
                }
                return {
                  result: { text: transcript },
                  usage: result.usage,
                  provider: 'OPENAI' as const,
                  model: route.actualModelId,
                };
              } finally {
                file.destroy();
              }
            } catch (error) {
              lastError = error;
              if (!isRetryableProviderError(error) || attemptIndex + 1 >= definition.retryPolicy.maxAttempts) {
                throw error;
              }
            }
          }
          throw lastError;
        },
      });

      return {
        text: generation.result.text,
        durationSec: inspected.durationSec,
        format: inspected.format,
        generationId: generation.generationId,
        aiPointsCharged: generation.aiPointsCharged,
        aiBalanceRemaining: generation.aiBalanceRemaining,
      };
    } finally {
      await fs.promises.unlink(normalizedPath).catch(() => undefined);
    }
  },
};
