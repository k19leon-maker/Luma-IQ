import { createHash, randomBytes } from 'crypto';
import { Prisma, TelegramBot } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { TelegramBotDiagnostics, telegramBotService } from './telegram-bot.service';
import {
  safeTelegramErrorMessage,
  telegramSecretService,
  telegramTokenLast4,
  TelegramSecretError,
} from './telegram-secret.service';

const ACTIVE_ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'];

export class TelegramBotManagementError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: {
    status: number;
    code: string;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = 'TelegramBotManagementError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export interface TelegramBotPublicView {
  id: string;
  defaultProjectId: string | null;
  telegramBotId: string;
  username: string;
  displayName: string;
  tokenHint: string | null;
  status: TelegramBot['status'];
  webhookConfigured: boolean;
  webhookUrl: string | null;
  lastHealthCheckAt: Date | null;
  lastError: string | null;
  webhookConnectedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function webhookUrl(publicBotKey: string): string {
  const base = env.TELEGRAM_WEBHOOK_BASE_URL.trim().replace(/\/+$/, '');
  if (!base) {
    throw new TelegramBotManagementError('Telegram webhook URL is not configured', {
      status: 503,
      code: 'TELEGRAM_WEBHOOK_URL_NOT_CONFIGURED',
    });
  }
  let url: URL;
  try {
    url = new URL(`${base}/${publicBotKey}`);
  } catch {
    throw new TelegramBotManagementError('Telegram webhook URL is invalid', {
      status: 503,
      code: 'TELEGRAM_WEBHOOK_URL_INVALID',
    });
  }
  if (url.protocol !== 'https:') {
    throw new TelegramBotManagementError('Telegram webhook URL must use HTTPS', {
      status: 503,
      code: 'TELEGRAM_WEBHOOK_URL_REQUIRES_HTTPS',
    });
  }
  return url.toString();
}

function optionalWebhookUrl(bot: Pick<TelegramBot, 'publicBotKey'>): string | null {
  if (!env.TELEGRAM_WEBHOOK_BASE_URL.trim()) return null;
  try {
    return webhookUrl(bot.publicBotKey);
  } catch {
    return null;
  }
}

function publicView(bot: TelegramBot): TelegramBotPublicView {
  return {
    id: bot.id,
    defaultProjectId: bot.defaultProjectId,
    telegramBotId: bot.telegramBotId,
    username: bot.username,
    displayName: bot.displayName,
    tokenHint: bot.tokenLast4 ? `••••${bot.tokenLast4}` : null,
    status: bot.status,
    webhookConfigured: Boolean(bot.webhookSecretHash && bot.webhookConnectedAt),
    webhookUrl: optionalWebhookUrl(bot),
    lastHealthCheckAt: bot.lastHealthCheckAt,
    lastError: bot.lastError,
    webhookConnectedAt: bot.webhookConnectedAt,
    disconnectedAt: bot.disconnectedAt,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
  };
}

function secretFailure(error: TelegramSecretError): TelegramBotManagementError {
  const unavailable = error.code === 'TELEGRAM_TOKEN_ENCRYPTION_NOT_CONFIGURED'
    || error.code === 'TELEGRAM_TOKEN_ACTIVE_KEY_MISSING'
    || error.code === 'TELEGRAM_TOKEN_KEY_UNAVAILABLE';
  return new TelegramBotManagementError(
    unavailable ? 'Хранилище Telegram-токенов не настроено' : 'Не удалось обработать Telegram-токен',
    {
      status: unavailable ? 503 : 500,
      code: error.code,
    },
  );
}

async function assertOwnedProject(userId: string, projectId?: string): Promise<void> {
  if (!projectId) return;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!project) {
    throw new TelegramBotManagementError('Проект не найден', {
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  }
}

async function getOwnedBot(userId: string, botId: string): Promise<TelegramBot> {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: botId, userId, deletedAt: null },
  });
  if (!bot) {
    throw new TelegramBotManagementError('Бот не найден', {
      status: 404,
      code: 'TELEGRAM_BOT_NOT_FOUND',
    });
  }
  return bot;
}

function encryptToken(token: string): { encryptedToken: string; tokenKeyVersion: number; tokenLast4: string } {
  try {
    const encrypted = telegramSecretService.encrypt(token);
    return {
      encryptedToken: encrypted.ciphertext,
      tokenKeyVersion: encrypted.keyVersion,
      tokenLast4: telegramTokenLast4(token),
    };
  } catch (error) {
    if (error instanceof TelegramSecretError) throw secretFailure(error);
    throw error;
  }
}

function decryptToken(bot: TelegramBot): string {
  if (!bot.encryptedToken) {
    throw new TelegramBotManagementError('Telegram-токен удалён или недоступен', {
      status: 409,
      code: 'TELEGRAM_BOT_TOKEN_UNAVAILABLE',
    });
  }
  try {
    return telegramSecretService.decrypt(bot.encryptedToken);
  } catch (error) {
    if (error instanceof TelegramSecretError) throw secretFailure(error);
    throw error;
  }
}

async function markConnectionError(userId: string, botId: string, error: unknown): Promise<void> {
  await prisma.telegramBot.updateMany({
    where: { id: botId, userId, deletedAt: null },
    data: {
      status: 'ERROR',
      lastError: safeTelegramErrorMessage(error).slice(0, 2000),
      lastHealthCheckAt: new Date(),
    },
  }).catch(() => undefined);
}

function webhookConflict(diagnostics: TelegramBotDiagnostics, expectedUrl: string): boolean {
  return Boolean(
    diagnostics.webhook.configured
      && diagnostics.webhook.url
      && diagnostics.webhook.url !== expectedUrl,
  );
}

export const telegramBotManagementService = {
  async list(userId: string): Promise<TelegramBotPublicView[]> {
    const bots = await prisma.telegramBot.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return bots.map(publicView);
  },

  async get(userId: string, botId: string): Promise<TelegramBotPublicView> {
    return publicView(await getOwnedBot(userId, botId));
  },

  async update(userId: string, botId: string, input: {
    defaultProjectId: string | null;
  }): Promise<TelegramBotPublicView> {
    await getOwnedBot(userId, botId);
    await assertOwnedProject(userId, input.defaultProjectId ?? undefined);
    const result = await prisma.telegramBot.updateMany({
      where: { id: botId, userId, deletedAt: null },
      data: { defaultProjectId: input.defaultProjectId },
    });
    if (result.count !== 1) {
      throw new TelegramBotManagementError('Бот не найден', {
        status: 404,
        code: 'TELEGRAM_BOT_NOT_FOUND',
      });
    }
    return publicView(await getOwnedBot(userId, botId));
  },

  async create(userId: string, input: {
    token: string;
    defaultProjectId?: string;
  }): Promise<{ bot: TelegramBotPublicView; diagnostics: TelegramBotDiagnostics }> {
    await assertOwnedProject(userId, input.defaultProjectId);
    const diagnostics = await telegramBotService.diagnose(input.token);
    if (!diagnostics.bot.username) {
      throw new TelegramBotManagementError('Telegram не вернул username бота', {
        status: 502,
        code: 'TELEGRAM_BOT_USERNAME_MISSING',
      });
    }

    const telegramBotId = String(diagnostics.bot.id);
    const existing = await prisma.telegramBot.findUnique({ where: { telegramBotId } });
    if (existing && (existing.userId !== userId || !existing.deletedAt)) {
      throw new TelegramBotManagementError('Этот Telegram-бот уже подключён', {
        status: 409,
        code: 'TELEGRAM_BOT_ALREADY_CONNECTED',
      });
    }

    const encrypted = encryptToken(input.token);
    const commonData = {
      defaultProjectId: input.defaultProjectId ?? null,
      username: diagnostics.bot.username,
      displayName: diagnostics.bot.firstName,
      ...encrypted,
      webhookSecretHash: null,
      status: 'DRAFT' as const,
      lastHealthCheckAt: new Date(),
      lastError: null,
      webhookConnectedAt: null,
      disconnectedAt: null,
      deletedAt: null,
    };

    let bot: TelegramBot;
    try {
      bot = existing
        ? await prisma.telegramBot.update({ where: { id: existing.id }, data: commonData })
        : await prisma.telegramBot.create({
          data: {
            userId,
            telegramBotId,
            publicBotKey: randomBytes(24).toString('base64url'),
            ...commonData,
          },
        });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new TelegramBotManagementError('Этот Telegram-бот уже подключён', {
          status: 409,
          code: 'TELEGRAM_BOT_ALREADY_CONNECTED',
        });
      }
      throw error;
    }

    return { bot: publicView(bot), diagnostics };
  },

  async rotateToken(userId: string, botId: string, token: string): Promise<TelegramBotPublicView> {
    const bot = await getOwnedBot(userId, botId);
    const diagnostics = await telegramBotService.diagnose(token);
    if (String(diagnostics.bot.id) !== bot.telegramBotId) {
      throw new TelegramBotManagementError('Токен принадлежит другому Telegram-боту', {
        status: 409,
        code: 'TELEGRAM_TOKEN_BOT_MISMATCH',
      });
    }
    if (!diagnostics.bot.username) {
      throw new TelegramBotManagementError('Telegram не вернул username бота', {
        status: 502,
        code: 'TELEGRAM_BOT_USERNAME_MISSING',
      });
    }

    const result = await prisma.telegramBot.updateMany({
      where: { id: botId, userId, deletedAt: null },
      data: {
        username: diagnostics.bot.username,
        displayName: diagnostics.bot.firstName,
        ...encryptToken(token),
        lastHealthCheckAt: new Date(),
        lastError: null,
      },
    });
    if (result.count !== 1) return publicView(await getOwnedBot(userId, botId));
    return publicView(await getOwnedBot(userId, botId));
  },

  async diagnostics(userId: string, botId: string): Promise<TelegramBotDiagnostics> {
    const bot = await getOwnedBot(userId, botId);
    try {
      const diagnostics = await telegramBotService.diagnose(decryptToken(bot));
      await prisma.telegramBot.updateMany({
        where: { id: botId, userId, deletedAt: null },
        data: { lastHealthCheckAt: new Date(), lastError: null },
      });
      return diagnostics;
    } catch (error) {
      await markConnectionError(userId, botId, error);
      throw error;
    }
  },

  async connectWebhook(userId: string, botId: string, input: {
    replaceExistingWebhook: boolean;
    dropPendingUpdates: boolean;
  }): Promise<{ bot: TelegramBotPublicView; diagnostics: TelegramBotDiagnostics }> {
    const bot = await getOwnedBot(userId, botId);
    const token = decryptToken(bot);
    const expectedUrl = webhookUrl(bot.publicBotKey);
    const diagnostics = await telegramBotService.diagnose(token);
    if (webhookConflict(diagnostics, expectedUrl) && !input.replaceExistingWebhook) {
      throw new TelegramBotManagementError(
        'У бота уже настроен webhook другого сервиса. Требуется явное подтверждение замены.',
        {
          status: 409,
          code: 'TELEGRAM_WEBHOOK_CONFLICT',
          details: { existingHost: diagnostics.webhook.host },
        },
      );
    }

    const secretToken = randomBytes(32).toString('base64url');
    const webhookSecretHash = createHash('sha256').update(secretToken).digest('hex');
    const prepared = await prisma.telegramBot.updateMany({
      where: { id: botId, userId, deletedAt: null },
      data: {
        webhookSecretHash,
        status: 'DRAFT',
        lastError: null,
      },
    });
    if (prepared.count !== 1) {
      throw new TelegramBotManagementError('Бот не найден', {
        status: 404,
        code: 'TELEGRAM_BOT_NOT_FOUND',
      });
    }

    try {
      await telegramBotService.setWebhook({
        token,
        url: expectedUrl,
        secretToken,
        allowedUpdates: ACTIVE_ALLOWED_UPDATES,
        dropPendingUpdates: input.dropPendingUpdates,
      });
      await prisma.telegramBot.updateMany({
        where: { id: botId, userId, deletedAt: null },
        data: {
          status: 'ACTIVE',
          webhookConnectedAt: new Date(),
          disconnectedAt: null,
          lastHealthCheckAt: new Date(),
          lastError: null,
        },
      });
      return {
        bot: publicView(await getOwnedBot(userId, botId)),
        diagnostics,
      };
    } catch (error) {
      await markConnectionError(userId, botId, error);
      throw error;
    }
  },

  async disconnectWebhook(userId: string, botId: string, dropPendingUpdates: boolean): Promise<TelegramBotPublicView> {
    const bot = await getOwnedBot(userId, botId);
    try {
      await telegramBotService.deleteWebhook({
        token: decryptToken(bot),
        dropPendingUpdates,
      });
      await prisma.telegramBot.updateMany({
        where: { id: botId, userId, deletedAt: null },
        data: {
          status: 'DISCONNECTED',
          webhookSecretHash: null,
          disconnectedAt: new Date(),
          lastError: null,
        },
      });
      return publicView(await getOwnedBot(userId, botId));
    } catch (error) {
      await markConnectionError(userId, botId, error);
      throw error;
    }
  },

  async archive(userId: string, botId: string): Promise<void> {
    const bot = await getOwnedBot(userId, botId);
    try {
      await telegramBotService.deleteWebhook({ token: decryptToken(bot), dropPendingUpdates: false });
    } catch (error) {
      await markConnectionError(userId, botId, error);
      throw error;
    }
    const result = await prisma.telegramBot.updateMany({
      where: { id: botId, userId, deletedAt: null },
      data: {
        status: 'ARCHIVED',
        encryptedToken: null,
        tokenLast4: null,
        webhookSecretHash: null,
        deletedAt: new Date(),
        disconnectedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      throw new TelegramBotManagementError('Бот не найден', {
        status: 404,
        code: 'TELEGRAM_BOT_NOT_FOUND',
      });
    }
  },
};

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
