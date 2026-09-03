import { Response } from 'express';
import { z } from 'zod';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { TelegramBotApiError, telegramBotService } from '../services/telegram-bot.service';
import { TelegramUpdate, telegramBotRuntimeService } from '../services/telegram-bot-runtime.service';
import {
  TelegramBotManagementError,
  telegramBotManagementService,
} from '../services/telegram-bot-management.service';
import {
  TelegramWebhookAuthError,
  TelegramWebhookUpdate,
  telegramWebhookService,
} from '../services/telegram-webhook.service';
import { safeTelegramErrorMessage } from '../services/telegram-secret.service';

const diagnoseSchema = z.object({
  token: z.string()
    .trim()
    .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,}$/, 'Некорректный формат токена Telegram-бота'),
});

const webhookUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
}).passthrough();

const botIdSchema = z.string().uuid();
const publicBotKeySchema = z.string().regex(/^[A-Za-z0-9_-]{24,64}$/);
const createBotSchema = z.object({
  token: diagnoseSchema.shape.token,
  defaultProjectId: z.string().uuid().optional(),
}).strict();
const replaceTokenSchema = z.object({ token: diagnoseSchema.shape.token }).strict();
const updateBotSchema = z.object({
  defaultProjectId: z.string().uuid().nullable(),
}).strict();
const webhookMutationSchema = z.object({
  replaceExistingWebhook: z.boolean().default(false),
  dropPendingUpdates: z.boolean().default(false),
}).strict();
const disconnectWebhookSchema = z.object({
  dropPendingUpdates: z.boolean().default(false),
}).strict();

function managementFailure(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof TelegramBotManagementError || error instanceof TelegramBotApiError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...(error instanceof TelegramBotManagementError && error.details ? { details: error.details } : {}),
    });
    return;
  }
  console.error('[TelegramBots] request failed', { message: safeTelegramErrorMessage(error) });
  res.status(500).json({ error: 'TELEGRAM_BOT_REQUEST_FAILED', message: fallbackMessage });
}

function parsedBotId(req: AuthRequest, res: Response): string | null {
  const parsed = botIdSchema.safeParse(req.params.botId);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_TELEGRAM_BOT_ID' });
    return null;
  }
  return parsed.data;
}

function safeSecretEqual(received: string, expected: string): boolean {
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function updateKind(update: Record<string, unknown>): string {
  return [
    'message',
    'edited_message',
    'channel_post',
    'edited_channel_post',
    'callback_query',
    'inline_query',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ].find((key) => key in update) ?? 'unknown';
}

export const telegramBotController = {
  async webhook(req: AuthRequest, res: Response): Promise<void> {
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(503).json({ error: 'TELEGRAM_WEBHOOK_NOT_CONFIGURED' });
      return;
    }

    const receivedSecret = req.header('x-telegram-bot-api-secret-token') ?? '';
    if (!receivedSecret || !safeSecretEqual(receivedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      res.status(401).json({ error: 'INVALID_TELEGRAM_WEBHOOK_SECRET' });
      return;
    }

    const parsed = webhookUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_UPDATE' });
      return;
    }

    console.log('[TelegramWebhook] update received', {
      updateId: parsed.data.update_id,
      kind: updateKind(parsed.data),
    });
    try {
      await telegramBotRuntimeService.handleUpdate(parsed.data as TelegramUpdate);
    } catch (error) {
      console.error('[TelegramWebhook] processing failed', {
        updateId: parsed.data.update_id,
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'TELEGRAM_UPDATE_PROCESSING_FAILED' });
      return;
    }
    res.sendStatus(200);
  },

  async webhookV2(req: AuthRequest, res: Response): Promise<void> {
    const publicBotKey = publicBotKeySchema.safeParse(req.params.publicBotKey);
    const update = webhookUpdateSchema.safeParse(req.body);
    if (!publicBotKey.success || !update.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_UPDATE' });
      return;
    }

    try {
      const result = await telegramWebhookService.ingest({
        publicBotKey: publicBotKey.data,
        receivedSecret: req.header('x-telegram-bot-api-secret-token') ?? '',
        update: update.data as TelegramWebhookUpdate,
      });
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof TelegramWebhookAuthError) {
        res.status(error.status).json({ error: error.code });
        return;
      }
      console.error('[TelegramWebhookV2] ingest failed', {
        updateId: update.data.update_id,
        message: safeTelegramErrorMessage(error),
      });
      res.status(500).json({ error: 'TELEGRAM_UPDATE_INGEST_FAILED' });
    }
  },

  async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const bots = await telegramBotManagementService.list(req.userId!);
      res.json({ bots });
    } catch (error) {
      managementFailure(res, error, 'Не удалось загрузить Telegram-ботов');
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createBotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_TELEGRAM_BOT_INPUT',
        message: parsed.error.errors[0]?.message,
      });
      return;
    }
    try {
      const result = await telegramBotManagementService.create(req.userId!, parsed.data);
      res.status(201).json(result);
    } catch (error) {
      managementFailure(res, error, 'Не удалось подключить Telegram-бота');
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    try {
      const bot = await telegramBotManagementService.get(req.userId!, botId);
      res.json({ bot });
    } catch (error) {
      managementFailure(res, error, 'Не удалось загрузить Telegram-бота');
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    const parsed = updateBotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_BOT_INPUT' });
      return;
    }
    try {
      const bot = await telegramBotManagementService.update(req.userId!, botId, parsed.data);
      res.json({ bot });
    } catch (error) {
      managementFailure(res, error, 'Не удалось обновить Telegram-бота');
    }
  },

  async replaceToken(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    const parsed = replaceTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_BOT_TOKEN_FORMAT' });
      return;
    }
    try {
      const bot = await telegramBotManagementService.rotateToken(req.userId!, botId, parsed.data.token);
      res.json({ bot });
    } catch (error) {
      managementFailure(res, error, 'Не удалось заменить Telegram-токен');
    }
  },

  async botDiagnostics(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    try {
      const diagnostics = await telegramBotManagementService.diagnostics(req.userId!, botId);
      res.json({ diagnostics });
    } catch (error) {
      managementFailure(res, error, 'Не удалось проверить Telegram-бота');
    }
  },

  async connectWebhook(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    const parsed = webhookMutationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_WEBHOOK_INPUT' });
      return;
    }
    try {
      const result = await telegramBotManagementService.connectWebhook(req.userId!, botId, parsed.data);
      res.json(result);
    } catch (error) {
      managementFailure(res, error, 'Не удалось настроить Telegram webhook');
    }
  },

  async disconnectWebhook(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    const parsed = disconnectWebhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_WEBHOOK_INPUT' });
      return;
    }
    try {
      const bot = await telegramBotManagementService.disconnectWebhook(
        req.userId!,
        botId,
        parsed.data.dropPendingUpdates,
      );
      res.json({ bot });
    } catch (error) {
      managementFailure(res, error, 'Не удалось отключить Telegram webhook');
    }
  },

  async archive(req: AuthRequest, res: Response): Promise<void> {
    const botId = parsedBotId(req, res);
    if (!botId) return;
    try {
      await telegramBotManagementService.archive(req.userId!, botId);
      res.status(204).send();
    } catch (error) {
      managementFailure(res, error, 'Не удалось удалить Telegram-бота');
    }
  },

  async diagnose(req: AuthRequest, res: Response): Promise<void> {
    const parsed = diagnoseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_TELEGRAM_BOT_TOKEN_FORMAT',
        message: parsed.error.errors[0]?.message ?? 'Некорректный токен Telegram-бота',
      });
      return;
    }

    try {
      const diagnostics = await telegramBotService.diagnose(parsed.data.token);
      res.json({ diagnostics });
    } catch (error) {
      if (error instanceof TelegramBotApiError) {
        res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'TELEGRAM_DIAGNOSTICS_FAILED',
        message: 'Не удалось проверить Telegram-бота',
      });
    }
  },
};
