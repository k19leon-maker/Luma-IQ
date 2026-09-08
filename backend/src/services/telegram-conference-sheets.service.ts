import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { googleSheetsService } from './google-sheets.service';
import { TelegramBotApiError, telegramBotService } from './telegram-bot.service';
import { safeTelegramErrorMessage, telegramSecretService } from './telegram-secret.service';
import {
  addSheetTags,
  formatMoscow,
  normalizePhone,
  normalizeUsername,
  renderConferenceMessage,
  sheetBoolean,
  telegramMembershipConfirmed,
  testAccountAllowed,
  validTelegramJoinUrl,
} from './telegram-conference-sheets.logic';

type SheetValue = string | number | boolean;
type SheetRow = Record<string, SheetValue> & { __row: number };

interface ClaimedInboundUpdate {
  id: string;
  userId: string;
  botId: string;
  telegramUpdateId: string;
  payload: unknown;
}

interface TelegramActor {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TelegramContact {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  user_id?: number;
}

interface TelegramConferenceUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: TelegramActor;
    text?: string;
    contact?: TelegramContact;
  };
  callback_query?: {
    id: string;
    from: TelegramActor;
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
  };
}

interface ParsedUpdate {
  actor: TelegramActor;
  chatId: string;
  text: string | null;
  contact: TelegramContact | null;
  callbackId: string | null;
  callbackData: string | null;
}

interface ConferenceSpeaker {
  id: string;
  order: number;
  name: string;
  chatRef: string;
  channelUsername: string;
  joinUrl: string;
  required: boolean;
}

type ConferenceButton =
  | { type: 'url'; label: string; url: string }
  | { type: 'callback'; label: string; callbackData: string };

interface ConferenceConfig {
  botUsername: string;
  conferenceId: string;
  conferenceName: string;
  adminUsername: string;
  requiredCount: number;
  speakers: ConferenceSpeaker[];
  messages: Map<string, string>;
}

interface RuntimeBot {
  id: string;
  userId: string;
  username: string;
  token: string;
}

const SHEET = {
  settings: '00_Настройки',
  conferences: '01_Конференции',
  speakers: '02_Спикеры',
  steps: '04_Цепочка_сообщений',
  subscribers: '05_Подписчики',
  registrations: '06_Регистрации',
  subscriptions: '07_Кросс-подписки',
  events: '08_События',
} as const;

const WIDTH = {
  subscribers: 'V',
  registrations: 'Z',
  subscriptions: 'R',
  events: 'L',
} as const;

const DEFAULT_MESSAGE = {
  welcome: 'Здравствуйте, {{first_name}}! 👋\n\nВы регистрируетесь на онлайн-конференцию Hotel Store.',
  channels: 'Чтобы завершить регистрацию, подпишитесь на Telegram-каналы всех спикеров и нажмите «Я подписался».',
  missing: 'Подписка подтверждена не на все каналы. Подпишитесь на недостающие каналы и повторите проверку.',
  phone: 'Все подписки подтверждены ✅\n\nЧтобы завершить регистрацию, отправьте свой номер телефона. Это нужно, чтобы мы могли корректно отправить вам напоминание о конференции.',
  success: 'Регистрация завершена ✅\n\nНапоминание о конференции мы отправим в этот чат-бот.',
};

function spreadsheetId(): string {
  if (!env.TELEGRAM_CONFERENCE_SHEETS_SPREADSHEET_ID) {
    throw new Error('Conference Google Sheets spreadsheet is not configured');
  }
  return env.TELEGRAM_CONFERENCE_SHEETS_SPREADSHEET_ID;
}

function columnLetter(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function readRows(sheet: string, range: string): Promise<Array<Record<string, string>>> {
  const values = await googleSheetsService.getValues(`${sheet}!${range}`, spreadsheetId());
  const [headers = [], ...body] = values;
  return body.filter((row) => row.some((value) => value !== '')).map((row) => Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']),
  ));
}

async function headers(sheet: string, lastColumn: string): Promise<string[]> {
  return (await googleSheetsService.getValues(`${sheet}!A1:${lastColumn}1`, spreadsheetId()))[0] ?? [];
}

async function findSheetRow(
  sheet: string,
  lastColumn: string,
  maxRows: number,
  keyHeader: string,
  keyValue: string,
): Promise<SheetRow | null> {
  const names = await headers(sheet, lastColumn);
  const keyIndex = names.indexOf(keyHeader);
  if (keyIndex < 0) throw new Error(`${sheet}: key column ${keyHeader} is missing`);
  const keyColumn = columnLetter(keyIndex + 1);
  const keys = await googleSheetsService.getValues(`${sheet}!${keyColumn}2:${keyColumn}${maxRows}`, spreadsheetId());
  const match = keys.findIndex((row) => String(row[0] ?? '') === keyValue);
  if (match < 0) return null;
  const rowNumber = match + 2;
  const values = (await googleSheetsService.getValues(`${sheet}!A${rowNumber}:${lastColumn}${rowNumber}`, spreadsheetId()))[0] ?? [];
  return Object.assign(
    { __row: rowNumber },
    Object.fromEntries(names.map((name, index) => [name, values[index] ?? ''])),
  ) as SheetRow;
}

async function upsertSheetRow(input: {
  sheet: string;
  lastColumn: string;
  maxRows: number;
  keyHeader: string;
  keyValue: string;
  data: Record<string, SheetValue>;
}): Promise<SheetRow> {
  const names = await headers(input.sheet, input.lastColumn);
  const existing = await findSheetRow(
    input.sheet,
    input.lastColumn,
    input.maxRows,
    input.keyHeader,
    input.keyValue,
  );
  const merged = { ...(existing ?? {}), ...input.data };
  const values = names.map((name) => merged[name] ?? '');
  if (existing) {
    await googleSheetsService.updateValues(
      `${input.sheet}!A${existing.__row}:${input.lastColumn}${existing.__row}`,
      [values],
      spreadsheetId(),
    );
    return { ...merged, __row: existing.__row } as SheetRow;
  }
  const keyIndex = names.indexOf(input.keyHeader);
  if (keyIndex < 0) throw new Error(`${input.sheet}: key column ${input.keyHeader} is missing`);
  const keyColumn = columnLetter(keyIndex + 1);
  const keyValues = await googleSheetsService.getValues(
    `${input.sheet}!${keyColumn}2:${keyColumn}${input.maxRows}`,
    spreadsheetId(),
  );
  const firstGap = keyValues.findIndex((row) => String(row[0] ?? '').trim() === '');
  const rowNumber = firstGap >= 0 ? firstGap + 2 : keyValues.length + 2;
  if (rowNumber > input.maxRows) throw new Error(`${input.sheet}: row capacity ${input.maxRows} is exhausted`);
  await googleSheetsService.updateValues(
    `${input.sheet}!A${rowNumber}:${input.lastColumn}${rowNumber}`,
    [values],
    spreadsheetId(),
  );
  return { ...merged, __row: rowNumber } as SheetRow;
}

function parseUpdate(payload: unknown): ParsedUpdate | null {
  if (!payload || typeof payload !== 'object') return null;
  const update = payload as TelegramConferenceUpdate;
  if (update.message?.from && update.message.chat.type === 'private' && !update.message.from.is_bot) {
    return {
      actor: update.message.from,
      chatId: String(update.message.chat.id),
      text: update.message.text ?? null,
      contact: update.message.contact ?? null,
      callbackId: null,
      callbackData: null,
    };
  }
  if (update.callback_query?.message?.chat.type === 'private' && !update.callback_query.from.is_bot) {
    return {
      actor: update.callback_query.from,
      chatId: String(update.callback_query.message.chat.id),
      text: null,
      contact: null,
      callbackId: update.callback_query.id,
      callbackData: update.callback_query.data ?? null,
    };
  }
  return null;
}

function activeForBot(botId: string): boolean {
  return env.TELEGRAM_CONFERENCE_SHEETS_ENABLED
    && Boolean(env.TELEGRAM_CONFERENCE_SHEETS_SPREADSHEET_ID)
    && env.TELEGRAM_CONFERENCE_SHEETS_BOT_ID === botId;
}

function userAllowed(actor: TelegramActor): boolean {
  return testAccountAllowed({
    telegramUserId: String(actor.id),
    username: actor.username ?? null,
    allowedUserIds: env.TELEGRAM_CONFERENCE_SHEETS_TEST_USER_IDS,
    allowedUsernames: env.TELEGRAM_CONFERENCE_SHEETS_TEST_USERNAMES,
  });
}

async function runtimeBot(input: ClaimedInboundUpdate): Promise<RuntimeBot> {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: input.botId, userId: input.userId, status: 'ACTIVE', deletedAt: null },
    select: { id: true, userId: true, username: true, encryptedToken: true },
  });
  if (!bot?.encryptedToken) throw new Error('Conference Telegram bot token is unavailable');
  return { ...bot, token: telegramSecretService.decrypt(bot.encryptedToken) };
}

async function loadConfig(): Promise<ConferenceConfig> {
  const [settingRows, conferences, speakerRows, stepRows] = await Promise.all([
    googleSheetsService.getValues(`${SHEET.settings}!A2:B100`, spreadsheetId()),
    readRows(SHEET.conferences, 'A1:N100'),
    readRows(SHEET.speakers, 'A1:N100'),
    readRows(SHEET.steps, 'A1:Q100'),
  ]);
  const settings = Object.fromEntries(settingRows.filter((row) => row[0]).map((row) => [row[0], row[1] ?? '']));
  const conferenceId = settings.default_conference_id || conferences[0]?.conference_id;
  const conference = conferences.find((row) => row.conference_id === conferenceId);
  if (!conferenceId || !conference) throw new Error('Default conference is missing in Google Sheets');
  const speakers = speakerRows
    .filter((row) => row.conference_id === conferenceId && sheetBoolean(row['Активен']))
    .map((row) => {
      const channelUsername = normalizeUsername(row['Username канала']);
      return {
        id: row.speaker_id,
        order: Number(row['Порядок']) || 0,
        name: row['Имя спикера'] || row.speaker_id,
        chatRef: row['Telegram channel_id']?.trim() || (channelUsername ? `@${channelUsername}` : ''),
        channelUsername,
        joinUrl: row['Ссылка на канал']?.trim() || (channelUsername ? `https://t.me/${channelUsername}` : ''),
        required: sheetBoolean(row['Обязательная подписка']),
      } satisfies ConferenceSpeaker;
    })
    .filter((speaker) => speaker.required)
    .sort((left, right) => left.order - right.order);
  const messages = new Map(stepRows.map((row) => [row.step_id, row['Текст сообщения'] || '']));
  return {
    botUsername: settings.bot_username || '@stork_hotel_bot',
    conferenceId,
    conferenceName: conference['Название'] || conferenceId,
    adminUsername: normalizeUsername(settings.admin_telegram_username),
    requiredCount: Number(settings.required_channels_count) || speakers.length,
    speakers,
    messages,
  };
}

async function upsertDbSubscriber(input: ClaimedInboundUpdate, parsed: ParsedUpdate) {
  const username = parsed.actor.username ?? null;
  return prisma.botSubscriber.upsert({
    where: { botId_telegramUserId: { botId: input.botId, telegramUserId: String(parsed.actor.id) } },
    create: {
      userId: input.userId,
      botId: input.botId,
      telegramUserId: String(parsed.actor.id),
      telegramChatId: parsed.chatId,
      username,
      firstName: parsed.actor.first_name ?? null,
      lastName: parsed.actor.last_name ?? null,
      languageCode: parsed.actor.language_code ?? null,
      source: 'conference_google_sheets',
      status: 'ACTIVE',
      metadata: { conferenceSheet: spreadsheetId() } as Prisma.InputJsonValue,
    },
    update: {
      telegramChatId: parsed.chatId,
      username,
      firstName: parsed.actor.first_name ?? null,
      lastName: parsed.actor.last_name ?? null,
      languageCode: parsed.actor.language_code ?? null,
      source: 'conference_google_sheets',
      status: 'ACTIVE',
      stoppedAt: null,
      blockedAt: null,
      archivedAt: null,
      lastSeenAt: new Date(),
    },
  });
}

async function syncSubscriberSheet(
  parsed: ParsedUpdate,
  subscriber: Awaited<ReturnType<typeof upsertDbSubscriber>>,
  cfg: ConferenceConfig,
  extra?: { phone?: string; phoneSource?: string; tags?: string },
): Promise<SheetRow> {
  const existing = await findSheetRow(SHEET.subscribers, WIDTH.subscribers, 10_000, 'telegram_user_id', String(parsed.actor.id));
  const stamp = formatMoscow();
  const currentTags = String(existing?.['Метки'] ?? '');
  const role = normalizeUsername(parsed.actor.username) === cfg.adminUsername ? 'ADMIN' : 'TESTER';
  const identityTags = parsed.actor.username ? [] : ['username_missing'];
  return upsertSheetRow({
    sheet: SHEET.subscribers,
    lastColumn: WIDTH.subscribers,
    maxRows: 10_000,
    keyHeader: 'telegram_user_id',
    keyValue: String(parsed.actor.id),
    data: {
      internal_user_id: subscriber.id,
      telegram_user_id: String(parsed.actor.id),
      username: parsed.actor.username ?? '',
      'Имя': parsed.actor.first_name ?? '',
      'Фамилия': parsed.actor.last_name ?? '',
      'Телефон': extra?.phone ?? existing?.['Телефон'] ?? '',
      'Источник телефона': /.+/.test(extra?.phone ?? '') ? extra?.phoneSource ?? 'TELEGRAM_CONTACT_SELF' : existing?.['Источник телефона'] ?? '',
      language_code: parsed.actor.language_code ?? '',
      'Telegram Premium': parsed.actor.is_premium ?? sheetBoolean(existing?.['Telegram Premium']),
      'Первое обращение': existing?.['Первое обращение'] ?? stamp,
      'Последняя активность': stamp,
      '/start получен': existing?.['/start получен'] ?? stamp,
      'Источник': 'telegram_start',
      'Роль': role,
      'Статус подписчика': 'ACTIVE',
      'Метки': addSheetTags(currentTags, 'test', 'start_received', ...identityTags, ...(extra?.tags ? [extra.tags] : [])),
      'Создано': existing?.['Создано'] ?? stamp,
      'Обновлено': stamp,
    },
  });
}

function registrationId(cfg: ConferenceConfig, actor: TelegramActor): string {
  return `reg_${cfg.conferenceId}_${actor.id}`;
}

async function syncRegistration(input: {
  parsed: ParsedUpdate;
  subscriberId: string;
  cfg: ConferenceConfig;
  data?: Record<string, SheetValue>;
}): Promise<SheetRow> {
  const id = registrationId(input.cfg, input.parsed.actor);
  const existing = await findSheetRow(SHEET.registrations, WIDTH.registrations, 10_000, 'registration_id', id);
  const stamp = formatMoscow();
  return upsertSheetRow({
    sheet: SHEET.registrations,
    lastColumn: WIDTH.registrations,
    maxRows: 10_000,
    keyHeader: 'registration_id',
    keyValue: id,
    data: {
      registration_id: id,
      conference_id: input.cfg.conferenceId,
      internal_user_id: input.subscriberId,
      telegram_user_id: String(input.parsed.actor.id),
      username: input.parsed.actor.username ?? '',
      'Телефон': existing?.['Телефон'] ?? '',
      'Начало регистрации': existing?.['Начало регистрации'] ?? stamp,
      'Обязательных подписок': input.cfg.requiredCount,
      'Подтверждено подписок': existing?.['Подтверждено подписок'] ?? 0,
      'Все подписки подтверждены': sheetBoolean(existing?.['Все подписки подтверждены']),
      'Телефон получен': sheetBoolean(existing?.['Телефон получен']),
      'Статус регистрации': existing?.['Статус регистрации'] ?? 'STARTED',
      'Попыток проверки': Number(existing?.['Попыток проверки'] ?? 0),
      'Источник входа': existing?.['Источник входа'] ?? 'telegram_start',
      'Создано': existing?.['Создано'] ?? stamp,
      'Обновлено': stamp,
      ...(input.data ?? {}),
    },
  });
}

async function recordEvent(input: {
  update: ClaimedInboundUpdate;
  bot: RuntimeBot;
  parsed: ParsedUpdate;
  subscriberId: string;
  cfg: ConferenceConfig;
  eventType: string;
  stepId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const stamp = formatMoscow();
  const registration = registrationId(input.cfg, input.parsed.actor);
  await Promise.all([
    googleSheetsService.appendValues(`${SHEET.events}!A:${WIDTH.events}`, [[
      randomUUID(), stamp, `@${input.bot.username}`, input.cfg.conferenceId, input.subscriberId,
      registration, input.eventType, input.stepId, 'telegram_webhook', JSON.stringify(input.metadata ?? {}),
      'PROCESSED', stamp,
    ]], spreadsheetId()),
    prisma.botEvent.createMany({
      data: [{
        userId: input.update.userId,
        botId: input.update.botId,
        subscriberId: input.subscriberId,
        eventType: input.eventType,
        nodeId: input.stepId,
        sourceId: input.update.id,
        idempotencyKey: `conference-sheets:${input.update.id}:${input.eventType}`,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    }),
  ]);
}

function message(cfg: ConferenceConfig, stepId: string, fallback: string, parsed: ParsedUpdate): string {
  return renderConferenceMessage(cfg.messages.get(stepId) || fallback, {
    first_name: parsed.actor.first_name || 'друг',
    last_name: parsed.actor.last_name || '',
    username: parsed.actor.username || '',
    conference_name: cfg.conferenceName,
  });
}

function channelButtonRows(speakers: ConferenceSpeaker[]): ConferenceButton[][] {
  return speakers
    .filter((speaker) => validTelegramJoinUrl(speaker.joinUrl))
    .map((speaker) => [{ type: 'url' as const, label: `${speaker.order}. ${speaker.name}`, url: speaker.joinUrl }]);
}

async function handleStart(input: ClaimedInboundUpdate, bot: RuntimeBot, parsed: ParsedUpdate, cfg: ConferenceConfig, subscriberId: string): Promise<void> {
  await syncRegistration({
    parsed,
    subscriberId,
    cfg,
    data: { 'Статус регистрации': 'WAITING_SUBSCRIPTIONS' },
  });
  await telegramBotService.sendMessage({
    token: bot.token,
    chatId: parsed.chatId,
    text: message(cfg, 'step_welcome', DEFAULT_MESSAGE.welcome, parsed),
    parseMode: 'HTML',
  });
  const rows = channelButtonRows(cfg.speakers);
  rows.push([{ type: 'callback', label: '✅ Я подписался', callbackData: 'check_subscriptions' }]);
  const noChannels = rows.length === 1
    ? '\n\n⚠️ Тестовые каналы спикеров ещё не заполнены в таблице. Проверка покажет, какие настройки отсутствуют.'
    : '';
  await telegramBotService.sendMessage({
    token: bot.token,
    chatId: parsed.chatId,
    text: `${message(cfg, 'step_channels', DEFAULT_MESSAGE.channels, parsed)}${noChannels}`,
    parseMode: 'HTML',
    disableWebPreview: true,
    buttonRows: rows,
  });
  await recordEvent({
    update: input,
    bot,
    parsed,
    subscriberId,
    cfg,
    eventType: 'CONFERENCE_START',
    stepId: 'step_welcome',
    metadata: { telegramUpdateId: input.telegramUpdateId },
  });
}

interface SubscriptionResult {
  speaker: ConferenceSpeaker;
  status: 'SUBSCRIBED' | 'NOT_SUBSCRIBED' | 'ERROR' | 'CONFIG_ERROR';
  memberStatus: string;
  errorCode: string;
  errorMessage: string;
}

async function checkSpeaker(token: string, telegramUserId: string, speaker: ConferenceSpeaker): Promise<SubscriptionResult> {
  if (!speaker.chatRef || !validTelegramJoinUrl(speaker.joinUrl)) {
    return { speaker, status: 'CONFIG_ERROR', memberStatus: '', errorCode: 'CHANNEL_NOT_CONFIGURED', errorMessage: 'Не заполнены channel_id/username или ссылка канала' };
  }
  try {
    const member = await telegramBotService.getChatMember({ token, chatId: speaker.chatRef, userId: telegramUserId });
    return {
      speaker,
      status: telegramMembershipConfirmed(member) ? 'SUBSCRIBED' : 'NOT_SUBSCRIBED',
      memberStatus: member.status,
      errorCode: '',
      errorMessage: '',
    };
  } catch (error) {
    return {
      speaker,
      status: 'ERROR',
      memberStatus: '',
      errorCode: error instanceof TelegramBotApiError ? error.code : 'TELEGRAM_API_ERROR',
      errorMessage: safeTelegramErrorMessage(error).slice(0, 500),
    };
  }
}

async function syncSubscriptionResults(
  parsed: ParsedUpdate,
  subscriberId: string,
  cfg: ConferenceConfig,
  results: SubscriptionResult[],
): Promise<void> {
  const registration = registrationId(cfg, parsed.actor);
  const stamp = formatMoscow();
  for (const result of results) {
    const checkId = `${registration}:${result.speaker.id}`;
    const existing = await findSheetRow(SHEET.subscriptions, WIDTH.subscriptions, 50_000, 'check_id', checkId);
    const attempt = Number(existing?.['Номер попытки'] ?? 0) + 1;
    await upsertSheetRow({
      sheet: SHEET.subscriptions,
      lastColumn: WIDTH.subscriptions,
      maxRows: 50_000,
      keyHeader: 'check_id',
      keyValue: checkId,
      data: {
        check_id: checkId,
        registration_id: registration,
        conference_id: cfg.conferenceId,
        internal_user_id: subscriberId,
        telegram_user_id: String(parsed.actor.id),
        username: parsed.actor.username ?? '',
        speaker_id: result.speaker.id,
        'Имя спикера': result.speaker.name,
        'Telegram channel_id': result.speaker.chatRef,
        'Username канала': result.speaker.channelUsername,
        'Обязательная': result.speaker.required,
        'Статус проверки': result.status,
        telegram_member_status: result.memberStatus,
        'Проверено': stamp,
        'Номер попытки': attempt,
        'Код ошибки': result.errorCode,
        'Описание ошибки': result.errorMessage,
        'Обновлено': stamp,
      },
    });
  }
}

async function handleSubscriptionCheck(
  input: ClaimedInboundUpdate,
  bot: RuntimeBot,
  parsed: ParsedUpdate,
  cfg: ConferenceConfig,
  subscriberId: string,
): Promise<void> {
  if (parsed.callbackId) {
    await telegramBotService.answerCallbackQuery({
      token: bot.token,
      callbackQueryId: parsed.callbackId,
      text: 'Проверяю подписки…',
    });
  }
  const results = await Promise.all(cfg.speakers.map((speaker) => checkSpeaker(bot.token, String(parsed.actor.id), speaker)));
  await syncSubscriptionResults(parsed, subscriberId, cfg, results);
  const confirmed = results.filter((result) => result.status === 'SUBSCRIBED').length;
  const allSubscribed = results.length === cfg.requiredCount && confirmed === cfg.requiredCount;
  const statusByOrder = Object.fromEntries(results.map((result) => [`Спикер ${result.speaker.order}${result.speaker.order === 6 ? ' / Организатор' : ''}`, result.status]));
  const current = await findSheetRow(SHEET.registrations, WIDTH.registrations, 10_000, 'registration_id', registrationId(cfg, parsed.actor));
  await syncRegistration({
    parsed,
    subscriberId,
    cfg,
    data: {
      ...statusByOrder,
      'Подтверждено подписок': confirmed,
      'Все подписки подтверждены': allSubscribed,
      'Статус регистрации': allSubscribed ? 'WAITING_PHONE' : 'WAITING_SUBSCRIPTIONS',
      'Последняя проверка подписок': formatMoscow(),
      'Попыток проверки': Number(current?.['Попыток проверки'] ?? 0) + 1,
    },
  });
  if (allSubscribed) {
    await telegramBotService.sendMessage({
      token: bot.token,
      chatId: parsed.chatId,
      text: message(cfg, 'step_phone', DEFAULT_MESSAGE.phone, parsed),
      parseMode: 'HTML',
      replyKeyboard: [[{ label: 'Поделиться номером', requestContact: true }]],
    });
  } else {
    const missing = results.filter((result) => result.status !== 'SUBSCRIBED');
    const list = missing.map((result) => {
      const detail = result.status === 'CONFIG_ERROR'
        ? 'канал пока не настроен'
        : result.status === 'ERROR'
          ? 'ошибка проверки прав бота'
          : 'подписка не найдена';
      return `• ${result.speaker.name} — ${detail}`;
    }).join('\n');
    const rows = channelButtonRows(missing.map((result) => result.speaker));
    rows.push([{ type: 'callback', label: '✅ Я подписался', callbackData: 'check_subscriptions' }]);
    await telegramBotService.sendMessage({
      token: bot.token,
      chatId: parsed.chatId,
      text: `${message(cfg, 'step_missing', DEFAULT_MESSAGE.missing, parsed)}\n\n${list}`,
      parseMode: 'HTML',
      disableWebPreview: true,
      buttonRows: rows,
    });
  }
  await recordEvent({
    update: input,
    bot,
    parsed,
    subscriberId,
    cfg,
    eventType: 'SUBSCRIPTIONS_CHECKED',
    stepId: 'step_check',
    metadata: { confirmed, required: cfg.requiredCount, allSubscribed },
  });
}

async function handleContact(
  input: ClaimedInboundUpdate,
  bot: RuntimeBot,
  parsed: ParsedUpdate,
  cfg: ConferenceConfig,
  subscriberId: string,
): Promise<void> {
  const ownContact = parsed.contact?.user_id === parsed.actor.id;
  const phone = ownContact ? normalizePhone(parsed.contact?.phone_number) : '';
  const registration = await findSheetRow(SHEET.registrations, WIDTH.registrations, 10_000, 'registration_id', registrationId(cfg, parsed.actor));
  const subscriptionsConfirmed = sheetBoolean(registration?.['Все подписки подтверждены']);
  if (!ownContact || !phone) {
    await telegramBotService.sendMessage({
      token: bot.token,
      chatId: parsed.chatId,
      text: 'Пожалуйста, отправьте именно свой контакт кнопкой «Поделиться номером». Пересланные и введённые вручную номера не принимаются.',
      replyKeyboard: [[{ label: 'Поделиться номером', requestContact: true }]],
    });
    return;
  }
  if (!subscriptionsConfirmed) {
    await telegramBotService.sendMessage({
      token: bot.token,
      chatId: parsed.chatId,
      text: 'Сначала подтвердите подписки на все обязательные каналы кнопкой «Я подписался».',
      removeKeyboard: true,
    });
    return;
  }
  await prisma.botSubscriber.updateMany({
    where: { id: subscriberId, userId: input.userId, botId: input.botId, telegramUserId: String(parsed.actor.id) },
    data: { phone, lastSeenAt: new Date() },
  });
  const subscriber = await prisma.botSubscriber.findFirstOrThrow({ where: { id: subscriberId, userId: input.userId, botId: input.botId } });
  await syncSubscriberSheet(parsed, subscriber, cfg, { phone, phoneSource: 'TELEGRAM_CONTACT_SELF', tags: 'phone_validated;registration_completed' });
  const stamp = formatMoscow();
  await syncRegistration({
    parsed,
    subscriberId,
    cfg,
    data: {
      'Телефон': phone,
      'Телефон получен': true,
      'Статус регистрации': 'COMPLETED',
      'Завершено': stamp,
      'Подтверждение отправлено': stamp,
    },
  });
  await telegramBotService.sendMessage({
    token: bot.token,
    chatId: parsed.chatId,
    text: message(cfg, 'step_success', DEFAULT_MESSAGE.success, parsed),
    parseMode: 'HTML',
    removeKeyboard: true,
  });
  await recordEvent({
    update: input,
    bot,
    parsed,
    subscriberId,
    cfg,
    eventType: 'REGISTRATION_COMPLETED',
    stepId: 'step_success',
    metadata: { phoneSource: 'TELEGRAM_CONTACT_SELF' },
  });
}

export const telegramConferenceSheetsService = {
  handles(botId: string): boolean {
    return activeForBot(botId);
  },

  async processInboundUpdate(update: ClaimedInboundUpdate): Promise<void> {
    const parsed = parseUpdate(update.payload);
    if (!parsed) return;
    const bot = await runtimeBot(update);
    if (!userAllowed(parsed.actor)) {
      if (parsed.callbackId) {
        await telegramBotService.answerCallbackQuery({
          token: bot.token,
          callbackQueryId: parsed.callbackId,
          text: 'Бот пока работает в тестовом режиме',
          showAlert: true,
        });
      }
      return;
    }
    const cfg = await loadConfig();
    const subscriber = await upsertDbSubscriber(update, parsed);
    await syncSubscriberSheet(parsed, subscriber, cfg);

    if (parsed.text?.match(/^\/start(?:\s|$)/i)) {
      await handleStart(update, bot, parsed, cfg, subscriber.id);
      return;
    }
    if (parsed.callbackData === 'check_subscriptions') {
      await handleSubscriptionCheck(update, bot, parsed, cfg, subscriber.id);
      return;
    }
    if (parsed.contact) {
      await handleContact(update, bot, parsed, cfg, subscriber.id);
    }
  },
};
