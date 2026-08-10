import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inspectMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => vi.fn());
const generationRunMock = vi.hoisted(() => vi.fn());
const transcribeMock = vi.hoisted(() => vi.fn());
const actionResolveMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/env', () => ({
  env: {
    OPENAI_API_KEY: 'configured-test-key',
    OPENAI_TRANSCRIPTION_LANGUAGE: 'ru',
  },
}));

vi.mock('../../src/services/audio-file-inspection.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audio-file-inspection.service')>(
    '../../src/services/audio-file-inspection.service',
  );
  return {
    ...actual,
    audioFileInspectionService: { inspect: inspectMock },
  };
});

vi.mock('../../src/services/model-router.service', () => ({
  modelRouterService: { routeForAttempt: routeMock },
}));

vi.mock('../../src/services/ai-action-registry.service', () => ({
  aiActionRegistryService: { resolve: actionResolveMock },
}));

vi.mock('../../src/services/ai-generation.service', () => ({
  aiGenerationService: { run: generationRunMock },
}));

vi.mock('../../src/providers/openai.provider', () => ({
  openAIProvider: { transcribe: transcribeMock },
}));

import { audioTranscriptionService } from '../../src/services/audio-transcription.service';

const createdPaths: string[] = [];

async function tempFile(): Promise<string> {
  const filePath = path.join(os.tmpdir(), `lumaiq-transcription-test-${Date.now()}-${Math.random()}`);
  await fs.promises.writeFile(filePath, Buffer.from('audio'));
  createdPaths.push(filePath, `${filePath}.wav`);
  return filePath;
}

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((filePath) => fs.promises.unlink(filePath).catch(() => undefined)));
});

describe('audioTranscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectMock.mockResolvedValue({ format: 'wav', durationSec: 12.4 });
    actionResolveMock.mockResolvedValue({
      actionKey: 'audio_transcription',
      pipeline: [{ stage: 'generate', modelAlias: 'TRANSCRIBE_MINI', reasoning: 'low' }],
      contextBudget: 0,
      outputLimit: 0,
      retryPolicy: { maxAttempts: 2, retrySameProfile: true },
      fallbackPolicy: { aliases: [], allowDowngrade: false },
      batchEligible: false,
      aiPoints: 1,
      source: 'config',
    });
    routeMock.mockImplementation(async ({ attemptIndex }: { attemptIndex: number }) => ({
      provider: 'OPENAI',
      selectedAlias: 'TRANSCRIBE_MINI',
      actualModelId: 'gpt-4o-mini-transcribe',
      profileSource: 'database',
      profileVersionId: 'model-version-1',
      retryIndex: attemptIndex,
    }));
    transcribeMock.mockResolvedValue({
      result: { text: '  Проверенный текст  ' },
      usage: { inputTokens: 0, outputTokens: 10, audioInputTokens: 20 },
    });
    generationRunMock.mockImplementation(async (input: {
      execute: (context: { generationId: string }) => Promise<{ result: { text: string } }>;
    }) => {
      const executed = await input.execute({ generationId: 'generation-1' });
      return {
        result: executed.result,
        generationId: 'generation-1',
        aiPointsCharged: 1,
        aiBalanceRemaining: 99,
      };
    });
  });

  it('uses the routed OpenAI model and unified generation billing', async () => {
    const filePath = await tempFile();

    const result = await audioTranscriptionService.transcribe({
      userId: 'user-1',
      filePath,
      fileSize: 100,
      claimedMimeType: 'audio/wav',
      requestId: 'request-1',
    });

    expect(generationRunMock).toHaveBeenCalledWith(expect.objectContaining({
      featureCode: 'audio_transcription',
      actionKey: 'audio_transcription',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-transcribe',
      metadata: expect.objectContaining({ durationSec: 12, requestId: 'request-1' }),
    }));
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini-transcribe',
      telemetry: expect.objectContaining({
        generationId: 'generation-1',
        correlationId: 'request-1',
        retryIndex: 0,
      }),
    }));
    expect(result).toMatchObject({
      text: 'Проверенный текст',
      generationId: 'generation-1',
      aiPointsCharged: 1,
      aiBalanceRemaining: 99,
    });
    await expect(fs.promises.access(`${filePath}.wav`)).rejects.toThrow();
  });

  it('retries a temporary OpenAI failure with the same routed alias', async () => {
    const filePath = await tempFile();
    transcribeMock
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      })
      .mockResolvedValueOnce({
        result: { text: 'Готово' },
        usage: { inputTokens: 0, outputTokens: 5, audioInputTokens: 10 },
      });

    await audioTranscriptionService.transcribe({
      userId: 'user-1',
      filePath,
      fileSize: 100,
      claimedMimeType: 'audio/wav',
      requestId: 'request-retry',
    });

    expect(transcribeMock).toHaveBeenCalledTimes(2);
    expect(routeMock).toHaveBeenCalledWith(expect.objectContaining({ attemptIndex: 1 }));
  });

  it('rejects recordings longer than five minutes before billing', async () => {
    const filePath = await tempFile();
    inspectMock.mockResolvedValue({ format: 'wav', durationSec: 302 });

    await expect(audioTranscriptionService.transcribe({
      userId: 'user-1',
      filePath,
      fileSize: 100,
      claimedMimeType: 'audio/wav',
      requestId: 'request-long',
    })).rejects.toMatchObject({ code: 'AUDIO_DURATION_EXCEEDED', status: 413 });

    expect(generationRunMock).not.toHaveBeenCalled();
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});
