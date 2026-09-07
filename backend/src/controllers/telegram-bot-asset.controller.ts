import { Response } from 'express';
import { BotAssetMediaType } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  TelegramBotAssetError,
  telegramBotAssetService,
} from '../services/telegram-bot-asset.service';

const paramsSchema = z.object({
  botId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
});
const projectSchema = z.object({ projectId: z.string().uuid() });
const uploadSchema = projectSchema.extend({
  mediaType: z.enum(['image', 'document', 'video', 'audio']),
});

const mediaTypes: Record<z.infer<typeof uploadSchema>['mediaType'], BotAssetMediaType> = {
  image: 'IMAGE',
  document: 'DOCUMENT',
  video: 'VIDEO',
  audio: 'AUDIO',
};

function fail(res: Response, error: unknown, fallback: string): void {
  if (error instanceof TelegramBotAssetError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error('[TelegramBotAsset] request failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({ error: 'TELEGRAM_ASSET_REQUEST_FAILED', message: fallback });
}

function safeDownloadName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'file';
}

export const telegramBotAssetController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const params = paramsSchema.safeParse(req.params);
    const query = projectSchema.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_ASSET_INPUT' });
      return;
    }
    try {
      const assets = await telegramBotAssetService.list(req.userId!, params.data.botId, query.data.projectId);
      res.json({ assets });
    } catch (error) {
      fail(res, error, 'Не удалось загрузить файлы бота');
    }
  },

  async upload(req: AuthRequest, res: Response): Promise<void> {
    const params = paramsSchema.safeParse(req.params);
    const body = uploadSchema.safeParse(req.body);
    if (!params.success || !body.success || !req.file?.buffer) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_ASSET_INPUT', message: 'Выберите файл, проект и тип медиа' });
      return;
    }
    try {
      const asset = await telegramBotAssetService.upload(
        req.userId!,
        params.data.botId,
        body.data.projectId,
        mediaTypes[body.data.mediaType],
        req.file,
      );
      res.status(201).json({ asset });
    } catch (error) {
      fail(res, error, 'Не удалось сохранить файл бота');
    }
  },

  async download(req: AuthRequest, res: Response): Promise<void> {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assetId) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_ASSET_INPUT' });
      return;
    }
    try {
      const asset = await telegramBotAssetService.download(req.userId!, params.data.botId, params.data.assetId);
      const fallback = safeDownloadName(asset.originalName);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Content-Length', String(asset.sizeBytes));
      res.setHeader('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`);
      res.send(Buffer.from(asset.content));
    } catch (error) {
      fail(res, error, 'Не удалось скачать файл бота');
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assetId) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_ASSET_INPUT' });
      return;
    }
    try {
      await telegramBotAssetService.remove(req.userId!, params.data.botId, params.data.assetId);
      res.status(204).send();
    } catch (error) {
      fail(res, error, 'Не удалось удалить файл бота');
    }
  },
};
