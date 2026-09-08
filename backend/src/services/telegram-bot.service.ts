const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
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
  readonly retryAfterSeconds: number | null;

  constructor(message: string, options?: { status?: number; code?: string; retryAfterSeconds?: number | null }) {
    super(message);
    this.name = 'TelegramBotApiError';
    this.status = options?.status ?? 502;
    this.code = options?.code ?? 'TELEGRAM_API_ERROR';
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
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

async function telegramResult<T>(response: Response): Promise<T> {
  let body: TelegramApiResponse<T>;
  try {
    body = await response.json() as TelegramApiResponse<T>;
  } catch {
    throw new TelegramBotApiError('Telegram API вернул некорректный ответ', {
      status: 502,
      code: 'TELEGRAM_API_ERROR',
    });
  }

  if (!response.ok || !body.ok || body.result === undefined) {
    const invalidToken = response.status === 401 || body.error_code === 401;
    const rateLimited = response.status === 429 || body.error_code === 429;
    const botBlocked = response.status === 403 || body.error_code === 403;
    const badRequest = response.status === 400 || body.error_code === 400;
    throw new TelegramBotApiError(
      invalidToken
        ? 'Токен Telegram-бота недействителен'
        : rateLimited
          ? 'Telegram временно ограничил частоту отправки'
          : botBlocked
            ? 'Пользователь заблокировал Telegram-бота'
            : badRequest
              ? 'Telegram отклонил сообщение'
              : 'Telegram API не выполнил запрос',
      {
        status: invalidToken ? 400 : rateLimited ? 429 : botBlocked ? 403 : badRequest ? 400 : 502,
        code: invalidToken
          ? 'INVALID_TELEGRAM_BOT_TOKEN'
          : rateLimited
            ? 'TELEGRAM_RATE_LIMITED'
            : botBlocked
              ? 'TELEGRAM_BOT_BLOCKED'
              : badRequest
                ? 'TELEGRAM_BAD_REQUEST'
                : 'TELEGRAM_API_ERROR',
        retryAfterSeconds: body.parameters?.retry_after ?? null,
      },
    );
  }

  return body.result;
}

async function callTelegram<T>(
  token: string,
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(telegramEndpoint(token, method), {
      method: payload ? 'POST' : 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return await telegramResult<T>(response);
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

async function callTelegramMultipart<T>(token: string, method: string, payload: FormData): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(telegramEndpoint(token, method), {
      method: 'POST',
      signal: controller.signal,
      headers: { accept: 'application/json' },
      body: payload,
    });
    return await telegramResult<T>(response);
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

type TelegramButton =
  | { type: 'url'; label: string; url: string }
  | { type: 'callback'; label: string; callbackData: string };

type TelegramReplyButton = {
  label: string;
  requestContact?: boolean;
};

export interface TelegramChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked' | string;
  is_member?: boolean;
}

function inlineKeyboard(buttons?: TelegramButton[]) {
  return buttons?.length
    ? [buttons.map((button) => button.type === 'url'
      ? { text: button.label, url: button.url }
      : { text: button.label, callback_data: button.callbackData })]
    : undefined;
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

  async setWebhook(input: {
    token: string;
    url: string;
    secretToken: string;
    allowedUpdates?: string[];
    dropPendingUpdates?: boolean;
  }): Promise<void> {
    await callTelegram<boolean>(input.token, 'setWebhook', {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates ?? ['message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: input.dropPendingUpdates ?? false,
    });
  },

  async deleteWebhook(input: { token: string; dropPendingUpdates?: boolean }): Promise<void> {
    await callTelegram<boolean>(input.token, 'deleteWebhook', {
      drop_pending_updates: input.dropPendingUpdates ?? false,
    });
  },

  async answerCallbackQuery(input: {
    token: string;
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }): Promise<void> {
    await callTelegram<boolean>(input.token, 'answerCallbackQuery', {
      callback_query_id: input.callbackQueryId,
      ...(input.text ? { text: input.text.slice(0, 200) } : {}),
      show_alert: input.showAlert ?? false,
    });
  },

  async sendMessage(input: {
    token: string;
    chatId: string;
    text: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    disableWebPreview?: boolean;
    buttons?: TelegramButton[];
    buttonRows?: TelegramButton[][];
    replyKeyboard?: TelegramReplyButton[][];
    removeKeyboard?: boolean;
  }): Promise<{ messageId: string }> {
    const keyboard = input.buttonRows?.length
      ? input.buttonRows.map((row) => row.map((button) => button.type === 'url'
        ? { text: button.label, url: button.url }
        : { text: button.label, callback_data: button.callbackData }))
      : inlineKeyboard(input.buttons);
    const replyMarkup = keyboard
      ? { inline_keyboard: keyboard }
      : input.replyKeyboard?.length
        ? {
          keyboard: input.replyKeyboard.map((row) => row.map((button) => ({
            text: button.label,
            ...(button.requestContact ? { request_contact: true } : {}),
          }))),
          resize_keyboard: true,
          one_time_keyboard: true,
        }
        : input.removeKeyboard
          ? { remove_keyboard: true }
          : undefined;
    const result = await callTelegram<{ message_id: number }>(input.token, 'sendMessage', {
      chat_id: input.chatId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      disable_web_page_preview: input.disableWebPreview ?? false,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: String(result.message_id) };
  },

  async getChatMember(input: {
    token: string;
    chatId: string;
    userId: string;
  }): Promise<TelegramChatMember> {
    return callTelegram<TelegramChatMember>(input.token, 'getChatMember', {
      chat_id: input.chatId,
      user_id: input.userId,
    });
  },

  async sendMedia(input: {
    token: string;
    chatId: string;
    mediaType: 'image' | 'document' | 'video' | 'audio';
    content: Buffer;
    fileName: string;
    mimeType: string;
    caption?: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    buttons?: TelegramButton[];
  }): Promise<{ messageId: string }> {
    const config = {
      image: { method: 'sendPhoto', field: 'photo' },
      document: { method: 'sendDocument', field: 'document' },
      video: { method: 'sendVideo', field: 'video' },
      audio: { method: 'sendAudio', field: 'audio' },
    }[input.mediaType];
    const form = new FormData();
    form.append('chat_id', input.chatId);
    form.append(config.field, new Blob([new Uint8Array(input.content)], { type: input.mimeType }), input.fileName);
    if (input.caption) form.append('caption', input.caption);
    if (input.parseMode) form.append('parse_mode', input.parseMode);
    const keyboard = inlineKeyboard(input.buttons);
    if (keyboard) form.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
    const result = await callTelegramMultipart<{ message_id: number }>(input.token, config.method, form);
    return { messageId: String(result.message_id) };
  },
};
