const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

interface TelegramBotProfile {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface TelegramBotDiagnostics {
  bot: {
    id: number;
    firstName: string;
    username: string | null;
    canJoinGroups: boolean;
    canReadAllGroupMessages: boolean;
    supportsInlineQueries: boolean;
  };
  webhook: {
    configured: boolean;
    url: string | null;
    host: string | null;
    pendingUpdateCount: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    maxConnections: number | null;
    allowedUpdates: string[];
  };
}

export class TelegramBotApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = 'TelegramBotApiError';
    this.status = options?.status ?? 502;
    this.code = options?.code ?? 'TELEGRAM_API_ERROR';
  }
}

function telegramEndpoint(token: string, method: string): string {
  return `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`;
}

function webhookHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function unixTimestampToIso(value?: number): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

async function callTelegram<T>(token: string, method: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(telegramEndpoint(token, method), {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const body = await response.json() as TelegramApiResponse<T>;

    if (!response.ok || !body.ok || body.result === undefined) {
      const invalidToken = response.status === 401 || body.error_code === 401;
      throw new TelegramBotApiError(
        invalidToken ? 'Токен Telegram-бота недействителен' : 'Telegram API не выполнил запрос',
        {
          status: invalidToken ? 400 : 502,
          code: invalidToken ? 'INVALID_TELEGRAM_BOT_TOKEN' : 'TELEGRAM_API_ERROR',
        },
      );
    }

    return body.result;
  } catch (error) {
    if (error instanceof TelegramBotApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TelegramBotApiError('Telegram API не ответил вовремя', {
        status: 504,
        code: 'TELEGRAM_API_TIMEOUT',
      });
    }
    throw new TelegramBotApiError('Не удалось связаться с Telegram API', {
      status: 502,
      code: 'TELEGRAM_API_UNAVAILABLE',
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const telegramBotService = {
  async diagnose(token: string): Promise<TelegramBotDiagnostics> {
    const [bot, webhook] = await Promise.all([
      callTelegram<TelegramBotProfile>(token, 'getMe'),
      callTelegram<TelegramWebhookInfo>(token, 'getWebhookInfo'),
    ]);

    return {
      bot: {
        id: bot.id,
        firstName: bot.first_name,
        username: bot.username ?? null,
        canJoinGroups: bot.can_join_groups ?? false,
        canReadAllGroupMessages: bot.can_read_all_group_messages ?? false,
        supportsInlineQueries: bot.supports_inline_queries ?? false,
      },
      webhook: {
        configured: Boolean(webhook.url),
        url: webhook.url || null,
        host: webhookHost(webhook.url),
        pendingUpdateCount: webhook.pending_update_count,
        lastErrorAt: unixTimestampToIso(webhook.last_error_date),
        lastErrorMessage: webhook.last_error_message ?? null,
        maxConnections: webhook.max_connections ?? null,
        allowedUpdates: webhook.allowed_updates ?? [],
      },
    };
  },
};
