import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { telegramAccountService, TelegramIdentityInput } from './telegram-account.service';
import { telegramBotService } from './telegram-bot.service';
import { telegramLoginService } from './telegram-login.service';

type JsonObject = Record<string, unknown>;

export interface SystemTelegramHandlerResult {
  outcome: string;
  telegramAccountId: string | null;
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function idValue(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

function frontendOrigin(): string {
  const configured = env.FRONTEND_URL.split(',').map((value) => value.trim()).find(Boolean);
  if (!configured) throw new Error('SYSTEM_TELEGRAM_FRONTEND_URL_MISSING');
  const parsed = new URL(configured);
  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('SYSTEM_TELEGRAM_FRONTEND_URL_MUST_USE_HTTPS');
  }
  return parsed.origin;
}

function authUrl(path: '/auth/telegram' | '/auth/telegram/link', token: string): string {
  return `${frontendOrigin()}${path}#token=${encodeURIComponent(token)}`;
}

function actorFromMessage(message: JsonObject): TelegramIdentityInput | null {
  const from = objectValue(message.from);
  const chat = objectValue(message.chat);
  const telegramUserId = idValue(from?.id);
  const telegramChatId = idValue(chat?.id);
  if (!from || !telegramUserId || !telegramChatId) return null;
  if (stringValue(chat?.type) && chat?.type !== 'private') return null;
  return {
    telegramUserId,
    telegramChatId,
    username: stringValue(from.username),
    firstName: stringValue(from.first_name),
    lastName: stringValue(from.last_name),
    languageCode: stringValue(from.language_code),
  };
}

function updateActor(payload: JsonObject): TelegramIdentityInput | null {
  const message = objectValue(payload.message);
  if (message) return actorFromMessage(message);
  const callback = objectValue(payload.callback_query);
  if (!callback) return null;
  const callbackMessage = objectValue(callback.message);
  const from = objectValue(callback.from);
  const chat = objectValue(callbackMessage?.chat);
  const telegramUserId = idValue(from?.id);
  const telegramChatId = idValue(chat?.id) ?? telegramUserId;
  if (!from || !telegramUserId || !telegramChatId) return null;
  if (stringValue(chat?.type) && chat?.type !== 'private') return null;
  return {
    telegramUserId,
    telegramChatId,
    username: stringValue(from.username),
    firstName: stringValue(from.first_name),
    lastName: stringValue(from.last_name),
    languageCode: stringValue(from.language_code),
  };
}

async function sendAccountLink(identity: TelegramIdentityInput): Promise<SystemTelegramHandlerResult> {
  const link = await telegramAccountService.beginLinkFlow(identity);
  if (link.state === 'PENDING') {
    await telegramBotService.sendMessage({
      token: env.SYSTEM_TELEGRAM_BOT_TOKEN,
      chatId: identity.telegramChatId,
      text: 'Свяжите Telegram с вашим аккаунтом Luma IQ. Ссылка действует 10 минут.',
      buttons: [{
        type: 'url',
        label: 'Связать аккаунт',
        url: authUrl('/auth/telegram/link', link.token),
      }],
    });
    return { outcome: 'LINK_REQUIRED', telegramAccountId: link.accountId };
  }
  return sendWorkspaceLink(identity, link.accountId, 'Аккаунт уже связан с Luma IQ.');
}

async function sendWorkspaceLink(
  identity: TelegramIdentityInput,
  telegramAccountId: string,
  text: string,
): Promise<SystemTelegramHandlerResult> {
  const login = await telegramLoginService.issueBrowserLogin({
    telegramAccountId,
    intendedPath: '/app/ai-dialog',
  });
  await telegramBotService.sendMessage({
    token: env.SYSTEM_TELEGRAM_BOT_TOKEN,
    chatId: identity.telegramChatId,
    text,
    buttons: [{
      type: 'url',
      label: 'Открыть Luma IQ',
      url: authUrl('/auth/telegram', login.token),
    }],
  });
  return { outcome: 'WORKSPACE_LINK_SENT', telegramAccountId };
}

async function linkedAccount(identity: TelegramIdentityInput) {
  return telegramAccountService.resolveLinkedUser(identity.telegramUserId);
}

async function handleMessage(message: JsonObject): Promise<SystemTelegramHandlerResult> {
  const identity = actorFromMessage(message);
  if (!identity) return { outcome: 'NON_PRIVATE_MESSAGE_IGNORED', telegramAccountId: null };

  const text = stringValue(message.text);
  if (text && /^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
    const linked = await linkedAccount(identity);
    return linked
      ? sendWorkspaceLink(identity, linked.telegramAccountId, 'Luma IQ подключён. Откройте рабочее пространство.')
      : sendAccountLink(identity);
  }

  const linked = await linkedAccount(identity);
  if (!linked) return sendAccountLink(identity);

  const contentKind = text
    ? 'текстовое сообщение'
    : objectValue(message.voice)
      ? 'голосовое сообщение'
      : objectValue(message.document)
        ? 'документ'
        : 'сообщение';

  return sendWorkspaceLink(
    identity,
    linked.telegramAccountId,
    `Получено ${contentKind}. Откройте Luma IQ, чтобы продолжить работу.`,
  );
}

async function handleCallback(callback: JsonObject): Promise<SystemTelegramHandlerResult> {
  const identity = updateActor({ callback_query: callback });
  const callbackId = stringValue(callback.id);
  if (callbackId) {
    await telegramBotService.answerCallbackQuery({
      token: env.SYSTEM_TELEGRAM_BOT_TOKEN,
      callbackQueryId: callbackId,
      text: 'Открываем Luma IQ',
    });
  }
  if (!identity) return { outcome: 'CALLBACK_WITHOUT_PRIVATE_CHAT', telegramAccountId: null };
  const linked = await linkedAccount(identity);
  return linked
    ? sendWorkspaceLink(identity, linked.telegramAccountId, 'Продолжите работу в Luma IQ.')
    : sendAccountLink(identity);
}

async function handleMembership(payload: JsonObject): Promise<SystemTelegramHandlerResult> {
  const membership = objectValue(payload.my_chat_member);
  const chat = objectValue(membership?.chat);
  const status = stringValue(objectValue(membership?.new_chat_member)?.status);
  const telegramUserId = idValue(chat?.id);
  if (telegramUserId && (status === 'kicked' || status === 'left')) {
    await telegramAccountService.markBlocked(telegramUserId);
    return { outcome: 'ACCOUNT_BLOCKED', telegramAccountId: null };
  }
  return { outcome: 'MEMBERSHIP_UPDATED', telegramAccountId: null };
}

export const systemTelegramHandlerService = {
  async process(payload: Prisma.JsonValue): Promise<SystemTelegramHandlerResult> {
    const update = objectValue(payload);
    if (!update) return { outcome: 'INVALID_PAYLOAD_IGNORED', telegramAccountId: null };
    const message = objectValue(update.message);
    if (message) return handleMessage(message);
    const editedMessage = objectValue(update.edited_message);
    if (editedMessage) return handleMessage(editedMessage);
    const callback = objectValue(update.callback_query);
    if (callback) return handleCallback(callback);
    if (objectValue(update.my_chat_member)) return handleMembership(update);
    return { outcome: 'UNSUPPORTED_UPDATE_IGNORED', telegramAccountId: null };
  },
};

export const systemTelegramHandlerInternals = {
  authUrl,
  actorFromMessage,
  updateActor,
};
