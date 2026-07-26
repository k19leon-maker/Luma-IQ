import { Response } from 'express';
import * as fs from 'fs';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { openAIProvider } from '../providers/openai.provider';

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'video/webm',
  'video/mp4',
  'application/octet-stream',
]);

function cleanup(filePath?: string): void {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => undefined);
}

export const audioController = {
  async transcribe(req: AuthRequest, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Аудиофайл не передан' });
      return;
    }

    try {
      if (!env.OPENAI_API_KEY) {
        res.status(503).json({ error: 'Транскрибация временно недоступна' });
        return;
      }

      if (!file.size) {
        res.status(400).json({ error: 'Аудиофайл пустой' });
        return;
      }

      const mimeType = (file.mimetype || '').split(';')[0]?.toLowerCase();
      if (mimeType && !ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
        res.status(400).json({ error: 'Неподдерживаемый формат аудио' });
        return;
      }

      const result = await openAIProvider.transcribe({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_TRANSCRIPTION_MODEL,
        file: fs.createReadStream(file.path),
        language: env.OPENAI_TRANSCRIPTION_LANGUAGE,
        telemetry: {
          userId: req.userId ?? null,
          actionKey: 'audio_transcription',
          pipeline: 'voice-input',
          stage: 'transcription',
          promptVersion: 'not-applicable',
          modelAlias: 'TRANSCRIBE_MINI',
          modelSnapshot: {
            actualModelId: env.OPENAI_TRANSCRIPTION_MODEL,
            source: 'legacy-env',
          },
          retryIndex: 0,
          metadata: {
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        },
      });

      const text = result.result.text.trim();
      if (!text) {
        res.status(422).json({ error: 'Не удалось распознать голосовое сообщение' });
        return;
      }

      res.json({ text });
    } catch (err) {
      console.error('[audio] transcribe:', err);
      res.status(500).json({ error: 'Не удалось распознать голосовое сообщение' });
    } finally {
      cleanup(file.path);
    }
  },
};
