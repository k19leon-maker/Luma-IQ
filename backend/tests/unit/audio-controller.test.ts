import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from '../../src/middleware/auth.middleware';

const transcribeMock = vi.hoisted(() => vi.fn());
const getOwnedProjectMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/audio-transcription.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audio-transcription.service')>(
    '../../src/services/audio-transcription.service',
  );
  return {
    ...actual,
    audioTranscriptionService: { transcribe: transcribeMock },
  };
});

vi.mock('../../src/services/project.service', () => ({
  projectService: { getOwned: getOwnedProjectMock },
}));

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
    getOwnedProjectMock.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
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

  it('checks case project ownership before starting OpenAI transcription', async () => {
    const file = await uploadedFile();
    const res = response();
    transcribeMock.mockResolvedValue({
      text: 'История клиента',
      durationSec: 30,
      format: 'wav',
      generationId: 'generation-cases',
      aiPointsCharged: 10,
      aiBalanceRemaining: 40,
    });

    await audioController.transcribe({
      userId: 'user-1',
      file,
      body: { purpose: 'cases', projectId: '11111111-1111-4111-8111-111111111111' },
    } as AuthRequest, res);

    expect(getOwnedProjectMock).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111');
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'cases',
      projectId: '11111111-1111-4111-8111-111111111111',
    }));
  });

  it('rejects a foreign case project and cleans the upload before OpenAI', async () => {
    const file = await uploadedFile();
    const res = response();
    getOwnedProjectMock.mockResolvedValue(null);

    await audioController.transcribe({
      userId: 'user-1',
      file,
      body: { purpose: 'cases', projectId: '22222222-2222-4222-8222-222222222222' },
    } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 'PROJECT_NOT_FOUND',
      error: 'Проект не найден',
      requestId: 'request-controller-1',
    });
    expect(transcribeMock).not.toHaveBeenCalled();
    await expect(fs.promises.access(file.path)).rejects.toThrow();
  });

  it('rejects a case transcription without a project before OpenAI', async () => {
    const file = await uploadedFile();
    const res = response();

    await audioController.transcribe({
      userId: 'user-1',
      file,
      body: { purpose: 'cases' },
    } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUDIO_CONTEXT_INVALID',
      error: 'Для голосового кейса выберите проект',
      requestId: 'request-controller-1',
    });
    expect(getOwnedProjectMock).not.toHaveBeenCalled();
    expect(transcribeMock).not.toHaveBeenCalled();
    await expect(fs.promises.access(file.path)).rejects.toThrow();
  });

  it('preserves a balance-exhausted response for the voice UI', async () => {
    const file = await uploadedFile();
    const res = response();
    transcribeMock.mockRejectedValue(Object.assign(new Error('Недостаточно AI-баллов'), {
      status: 402,
      code: 'AI_BALANCE_EXHAUSTED',
    }));

    await audioController.transcribe({
      userId: 'user-1',
      file,
      body: { purpose: 'cases', projectId: '11111111-1111-4111-8111-111111111111' },
    } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AI_BALANCE_EXHAUSTED',
      error: 'Недостаточно AI-баллов',
      requestId: 'request-controller-1',
    });
    await expect(fs.promises.access(file.path)).rejects.toThrow();
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
