import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from '../../src/middleware/auth.middleware';

const transcribeMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/audio-transcription.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audio-transcription.service')>(
    '../../src/services/audio-transcription.service',
  );
  return {
    ...actual,
    audioTranscriptionService: { transcribe: transcribeMock },
  };
});

import { audioController } from '../../src/controllers/audio.controller';
import { AudioTranscriptionError } from '../../src/services/audio-transcription.service';

const createdPaths: string[] = [];

async function uploadedFile() {
  const filePath = path.join(os.tmpdir(), `lumaiq-controller-audio-${Date.now()}-${Math.random()}`);
  await fs.promises.writeFile(filePath, Buffer.from('audio'));
  createdPaths.push(filePath);
  return {
    fieldname: 'file',
    originalname: 'voice.wav',
    encoding: '7bit',
    mimetype: 'audio/wav',
    destination: os.tmpdir(),
    filename: path.basename(filePath),
    path: filePath,
    size: 5,
  };
}

function response() {
  const res = {
    locals: { requestId: 'request-controller-1' },
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((filePath) => fs.promises.unlink(filePath).catch(() => undefined)));
});

describe('audioController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns transcription accounting metadata and cleans the upload', async () => {
    const file = await uploadedFile();
    const res = response();
    transcribeMock.mockResolvedValue({
      text: 'Готовый текст',
      durationSec: 9.6,
      format: 'wav',
      generationId: 'generation-1',
      aiPointsCharged: 1,
      aiBalanceRemaining: 49,
    });

    await audioController.transcribe({ userId: 'user-1', file } as AuthRequest, res);

    expect(res.json).toHaveBeenCalledWith({
      text: 'Готовый текст',
      durationSec: 10,
      format: 'wav',
      generationId: 'generation-1',
      aiPointsCharged: 1,
      aiBalanceRemaining: 49,
      requestId: 'request-controller-1',
    });
    await expect(fs.promises.access(file.path)).rejects.toThrow();
  });

  it('returns a structured service error with the same request ID', async () => {
    const file = await uploadedFile();
    const res = response();
    transcribeMock.mockRejectedValue(new AudioTranscriptionError(
      'Транскрибация временно недоступна',
      'AUDIO_TRANSCRIPTION_UNAVAILABLE',
      503,
    ));

    await audioController.transcribe({ userId: 'user-1', file } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUDIO_TRANSCRIPTION_UNAVAILABLE',
      error: 'Транскрибация временно недоступна',
      requestId: 'request-controller-1',
    });
  });

  it('rejects a missing upload before calling OpenAI', async () => {
    const res = response();

    await audioController.transcribe({ userId: 'user-1' } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUDIO_FILE_MISSING',
      error: 'Аудиофайл не передан',
      requestId: 'request-controller-1',
    });
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});
