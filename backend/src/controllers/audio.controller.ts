import { Response } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth.middleware';
import { requestIdFrom } from '../middleware/request-context.middleware';
import { AudioFileInspectionError } from '../services/audio-file-inspection.service';
import {
  audioTranscriptionService,
  AudioTranscriptionError,
} from '../services/audio-transcription.service';

function cleanup(filePath?: string): void {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => undefined);
}

function sendAudioError(
  res: Response,
  status: number,
  code: string,
  error: string,
  requestId = requestIdFrom(res),
): void {
  res.status(status).json({ code, error, requestId });
}

function errorDetails(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AudioTranscriptionError || error instanceof AudioFileInspectionError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error && typeof error === 'object') {
    const value = error as { status?: unknown; code?: unknown; message?: unknown };
    const status = typeof value.status === 'number' ? value.status : 500;
    const code = typeof value.code === 'string' ? value.code : '';
    const message = typeof value.message === 'string' ? value.message : '';
    if (status === 402 || code === 'AI_BALANCE_EXHAUSTED' || code === 'LIMIT_EXCEEDED') {
      return {
        status: 402,
        code: code || 'AI_BALANCE_EXHAUSTED',
        message: message || 'AI-баланс закончился',
      };
    }
    if (status === 429) {
      return {
        status: 503,
        code: 'AUDIO_TRANSCRIPTION_BUSY',
        message: 'Сервис распознавания временно перегружен. Попробуйте ещё раз.',
      };
    }
    if (status === 413) {
      return {
        status: 413,
        code: 'AUDIO_FILE_TOO_LARGE',
        message: 'Аудиофайл слишком большой',
      };
    }
    if (status === 400 || status === 422) {
      return {
        status: 422,
        code: 'AUDIO_TRANSCRIPTION_REJECTED',
        message: 'Сервис не смог обработать эту аудиозапись',
      };
    }
    if (status === 401 || status === 403) {
      return {
        status: 503,
        code: 'AUDIO_TRANSCRIPTION_UNAVAILABLE',
        message: 'Транскрибация временно недоступна',
      };
    }
  }
  return {
    status: 500,
    code: 'AUDIO_TRANSCRIPTION_FAILED',
    message: 'Не удалось распознать голосовое сообщение',
  };
}

export const audioController = {
  async transcribe(req: AuthRequest, res: Response): Promise<void> {
    const requestId = requestIdFrom(res);
    const file = req.file;
    if (!file) {
      sendAudioError(res, 400, 'AUDIO_FILE_MISSING', 'Аудиофайл не передан', requestId);
      return;
    }
    if (!req.userId) {
      cleanup(file.path);
      sendAudioError(res, 401, 'AUTH_REQUIRED', 'Необходима авторизация', requestId);
      return;
    }

    try {
      if (!file.size) {
        sendAudioError(res, 400, 'AUDIO_FILE_EMPTY', 'Аудиофайл пустой', requestId);
        return;
      }

      const result = await audioTranscriptionService.transcribe({
        userId: req.userId,
        filePath: file.path,
        fileSize: file.size,
        claimedMimeType: file.mimetype,
        requestId,
      });

      res.json({
        text: result.text,
        durationSec: Math.round(result.durationSec),
        format: result.format,
        generationId: result.generationId,
        aiPointsCharged: result.aiPointsCharged,
        aiBalanceRemaining: result.aiBalanceRemaining,
        requestId,
      });
    } catch (error) {
      const details = errorDetails(error);
      console.error(`[audio] transcribe requestId=${requestId}:`, error);
      sendAudioError(res, details.status, details.code, details.message, requestId);
    } finally {
      cleanup(file.path);
    }
  },
};
