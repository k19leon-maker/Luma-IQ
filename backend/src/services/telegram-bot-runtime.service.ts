import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { googleSheetsService } from './google-sheets.service';

type SheetRow = Record<string, string> & { __row: string };
type TelegramUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string; language_code?: string };
type TelegramMessage = { message_id: number; date: number; text?: string; chat: { id: number; type: string }; from?: TelegramUser };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage };

const SHEETS = {
  secrets: 'Секреты', bots: 'Боты', scenarios: 'Сценарии', steps: 'Шаги', messages: 'Сообщения',
  buttons: 'Кнопки', subscribers: 'Подписчики', subscriptions: 'Подписки', events: 'События', sends: 'Отправки',
} as const;

const COLUMNS = {
  subscribers: ['subscriber_id','telegram_user_id','telegram_chat_id','telegram_username','first_name','last_name','full_name','phone','language_code','status','bot_id','tags','funnels_count','active_scenarios','first_seen_at','last_seen_at','last_activity_at','consent_status','consent_at','notes'],
  subscriptions: ['subscription_id','subscriber_id','bot_id','scenario_id','scenario_name','status','source','start_parameter','current_step_id','current_day','started_at','next_send_at','completed_at','stopped_at','stop_reason','tags_in_scenario','consent_version','updated_at'],
  events: ['event_id','occurred_at','subscriber_id','bot_id','scenario_id','event_type','step_id','message_id','button_id','tag_id','source','payload','telegram_update_id','processed','error','created_at'],
  sends: ['send_id','subscriber_id','subscription_id','bot_id','scenario_id','step_id','message_id','scheduled_at','sent_at','status','telegram_message_id','attempt_count','last_attempt_at','error_code','error_message','idempotency_key','created_at','updated_at'],
} as const;

let processing = false;
let timer: NodeJS.Timeout | null = null;

function spreadsheetId(): string {
  if (!env.TELEGRAM_BOT_SPREADSHEET_ID) throw new Error('TELEGRAM_BOT_SPREADSHEET_ID is not configured');
  return env.TELEGRAM_BOT_SPREADSHEET_ID;
}

function now(): string { return new Date().toISOString(); }
// Moscow stays on UTC+3 year-round. 09:00 MSK is therefore 06:00 UTC.
function nextMoscowNine(from = new Date()): string {
  const candidate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    6, 0, 0, 0,
  ));
  if (candidate.getTime() <= from.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
}
function allowedUserIds(): Set<string> { return new Set(env.TELEGRAM_BOT_TEST_USER_IDS.split(',').map(v => v.trim()).filter(Boolean)); }
function testUserAllowed(id: number): boolean { return !env.TELEGRAM_BOT_TEST_MODE || allowedUserIds().has(String(id)); }
function rowValues(columns: readonly string[], data: Record<string, unknown>): Array<string | number | boolean> {
  return columns.map(column => data[column] === undefined || data[column] === null ? '' : data[column] as string | number | boolean);
}
function parseTags(value = ''): string[] { return value.split(',').map(v => v.trim()).filter(Boolean); }
function addTag(value: string, tag: string): string { return [...new Set([...parseTags(value), tag])].join(', '); }

async function rows(sheet: string, range: string): Promise<SheetRow[]> {
  const values = await googleSheetsService.getValues(`${sheet}!${range}`, spreadsheetId());
  const [headers = [], ...body] = values;
  return body.filter(row => row.some(Boolean)).map((row, index) => Object.assign(
    { __row: String(index + 2) },
    Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
  ));
}

async function updateRow(sheet: string, columns: readonly string[], row: string, data: Record<string, unknown>): Promise<void> {
  const lastColumn = String.fromCharCode(64 + columns.length);
  await googleSheetsService.updateValues(`${sheet}!A${row}:${lastColumn}${row}`, [rowValues(columns, data)], spreadsheetId());
}

async function append(sheet: string, columns: readonly string[], data: Record<string, unknown>): Promise<void> {
  await googleSheetsService.appendValues(`${sheet}!A:${String.fromCharCode(64 + columns.length)}`, [rowValues(columns, data)], spreadsheetId());
}

async function config() {
  const [secretRows, bots, scenarios, steps, messages, buttons] = await Promise.all([
    googleSheetsService.getValues(`${SHEETS.secrets}!A2:A2`, spreadsheetId()),
    rows(SHEETS.bots, 'A1:L100'), rows(SHEETS.scenarios, 'A1:P200'), rows(SHEETS.steps, 'A1:R1000'),
    rows(SHEETS.messages, 'A1:N1000'), rows(SHEETS.buttons, 'A1:N1000'),
  ]);
  const token = secretRows[0]?.[0]?.trim();
  const bot = bots.find(item => item.status === 'подключён') ?? bots[0];
  if (!token || !bot) throw new Error('Telegram bot token or bot configuration is missing');
  const scenario = scenarios.find(item => item.scenario_id === bot.default_scenario_id);
  if (!scenario) throw new Error('Default Telegram scenario is missing');
  return { token, bot, scenario, steps, messages, buttons };
}

async function telegramCall<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!response.ok || !payload.ok || payload.result === undefined) throw Object.assign(new Error(payload.description || `Telegram HTTP ${response.status}`), { code: payload.error_code });
  return payload.result;
}

async function recordEvent(data: Record<string, unknown>): Promise<void> {
  const stamp = now();
  await append(SHEETS.events, COLUMNS.events, { event_id: randomUUID(), occurred_at: stamp, processed: true, created_at: stamp, ...data });
}

async function upsertSubscriber(message: TelegramMessage, botId: string): Promise<SheetRow> {
  const user = message.from!;
  const all = await rows(SHEETS.subscribers, 'A1:T5000');
  const existing = all.find(item => item.telegram_user_id === String(user.id));
  const stamp = now();
  const data = {
    subscriber_id: existing?.subscriber_id || randomUUID(), telegram_user_id: user.id, telegram_chat_id: message.chat.id,
    telegram_username: user.username ? `@${user.username}` : '', first_name: user.first_name || '', last_name: user.last_name || '',
    full_name: [user.first_name, user.last_name].filter(Boolean).join(' '), phone: existing?.phone || '', language_code: user.language_code || '',
    status: 'active', bot_id: botId, tags: existing?.tags || '', funnels_count: existing?.funnels_count || 0,
    active_scenarios: existing?.active_scenarios || '', first_seen_at: existing?.first_seen_at || stamp, last_seen_at: stamp,
    last_activity_at: stamp, consent_status: 'telegram_start', consent_at: existing?.consent_at || stamp, notes: existing?.notes || '',
  };
  if (existing) await updateRow(SHEETS.subscribers, COLUMNS.subscribers, existing.__row, data);
  else await append(SHEETS.subscribers, COLUMNS.subscribers, data);
  return { ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])), __row: existing?.__row || '' } as SheetRow;
}

async function startSubscription(subscriber: SheetRow, startParameter: string, cfg: Awaited<ReturnType<typeof config>>): Promise<void> {
  const all = await rows(SHEETS.subscriptions, 'A1:R10000');
  const existing = all.find(item => item.subscriber_id === subscriber.subscriber_id && item.scenario_id === cfg.scenario.scenario_id && item.status === 'active');
  if (existing) return;
  const messageSteps = cfg.steps.filter(step => step.scenario_id === cfg.scenario.scenario_id && step.step_type === 'message').sort((a, b) => Number(a.sequence_day) - Number(b.sequence_day));
  if (!messageSteps[0]) throw new Error('Scenario has no message steps');
  const stamp = now();
  await append(SHEETS.subscriptions, COLUMNS.subscriptions, {
    subscription_id: randomUUID(), subscriber_id: subscriber.subscriber_id, bot_id: cfg.bot.bot_id, scenario_id: cfg.scenario.scenario_id,
    scenario_name: cfg.scenario.name, status: 'active', source: 'telegram_start', start_parameter: startParameter,
    current_step_id: messageSteps[0].step_id, current_day: 0, started_at: stamp, next_send_at: nextMoscowNine(),
    tags_in_scenario: '', consent_version: 'telegram_start_v1', updated_at: stamp,
  });
}

async function sendDueSubscription(subscription: SheetRow, cfg: Awaited<ReturnType<typeof config>>): Promise<void> {
  const step = cfg.steps.find(item => item.step_id === subscription.current_step_id);
  const message = cfg.messages.find(item => item.step_id === subscription.current_step_id);
  if (!step || !message) throw new Error(`Message configuration missing for ${subscription.current_step_id}`);
  const sends = await rows(SHEETS.sends, 'A1:R20000');
  const idempotencyKey = `${subscription.subscription_id}:${message.message_id}`;
  if (sends.some(item => item.idempotency_key === idempotencyKey && item.status === 'sent')) return;
  const subscribers = await rows(SHEETS.subscribers, 'A1:T5000');
  const subscriber = subscribers.find(item => item.subscriber_id === subscription.subscriber_id);
  if (!subscriber) throw new Error(`Subscriber ${subscription.subscriber_id} is missing`);
  if (!testUserAllowed(Number(subscriber.telegram_user_id))) return;
  const button = cfg.buttons.find(item => item.message_id === message.message_id && item.url);
  const stageAction = cfg.steps.find(item => item.scenario_id === subscription.scenario_id && item.step_type === 'action' && item.default_next_step_id === step.step_id);
  const scheduledAt = subscription.next_send_at || now();
  const attemptAt = now();
  try {
    const result = await telegramCall<{ message_id: number }>(cfg.token, 'sendMessage', {
      chat_id: subscriber.telegram_chat_id, text: message.text, parse_mode: message.formatting === 'markdown' ? 'Markdown' : undefined,
      protect_content: String(message.protect_content).toUpperCase() === 'TRUE',
      reply_markup: button ? { inline_keyboard: [[{ text: button.title, url: button.url }]] } : undefined,
    });
    const sentAt = now();
    await append(SHEETS.sends, COLUMNS.sends, {
      send_id: randomUUID(), subscriber_id: subscriber.subscriber_id, subscription_id: subscription.subscription_id, bot_id: subscription.bot_id,
      scenario_id: subscription.scenario_id, step_id: step.step_id, message_id: message.message_id, scheduled_at: scheduledAt, sent_at: sentAt,
      status: 'sent', telegram_message_id: result.message_id, attempt_count: 1, last_attempt_at: attemptAt, idempotency_key: idempotencyKey, created_at: attemptAt, updated_at: sentAt,
    });
    const tag = stageAction?.tag_id || '';
    const updatedTags = tag ? addTag(subscriber.tags, tag) : subscriber.tags;
    const scenarioTags = tag ? addTag(subscription.tags_in_scenario, tag) : subscription.tags_in_scenario;
    if (tag) {
      await updateRow(SHEETS.subscribers, COLUMNS.subscribers, subscriber.__row, { ...subscriber, tags: updatedTags, last_activity_at: sentAt });
      await recordEvent({ subscriber_id: subscriber.subscriber_id, bot_id: subscription.bot_id, scenario_id: subscription.scenario_id, event_type: 'tag_assigned', step_id: step.step_id, message_id: message.message_id, tag_id: tag, source: 'scheduler' });
    }
    await recordEvent({ subscriber_id: subscriber.subscriber_id, bot_id: subscription.bot_id, scenario_id: subscription.scenario_id, event_type: 'message_sent', step_id: step.step_id, message_id: message.message_id, source: 'scheduler', payload: String(result.message_id) });
    const messageSteps = cfg.steps.filter(item => item.scenario_id === subscription.scenario_id && item.step_type === 'message').sort((a, b) => Number(a.sequence_day) - Number(b.sequence_day));
    const currentIndex = messageSteps.findIndex(item => item.step_id === step.step_id);
    const next = messageSteps[currentIndex + 1];
    await updateRow(SHEETS.subscriptions, COLUMNS.subscriptions, subscription.__row, {
      ...subscription, status: next ? 'active' : 'completed', current_step_id: next?.step_id || '', current_day: next?.sequence_day || step.sequence_day,
      next_send_at: next ? nextMoscowNine(new Date(sentAt)) : '', completed_at: next ? '' : sentAt,
      tags_in_scenario: scenarioTags, updated_at: sentAt,
    });
  } catch (error) {
    const err = error as Error & { code?: number };
    await append(SHEETS.sends, COLUMNS.sends, {
      send_id: randomUUID(), subscriber_id: subscriber.subscriber_id, subscription_id: subscription.subscription_id, bot_id: subscription.bot_id,
      scenario_id: subscription.scenario_id, step_id: step.step_id, message_id: message.message_id, scheduled_at: scheduledAt, status: 'failed',
      attempt_count: 1, last_attempt_at: attemptAt, error_code: err.code || '', error_message: err.message, idempotency_key: idempotencyKey,
      created_at: attemptAt, updated_at: now(),
    });
    throw error;
  }
}

export const telegramBotRuntimeService = {
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.from || message.from.is_bot || message.chat.type !== 'private') return;
    const cfg = await config();
    const subscriber = await upsertSubscriber(message, cfg.bot.bot_id);
    const startMatch = message.text?.match(/^\/start(?:\s+(.+))?$/i);
    await recordEvent({ subscriber_id: subscriber.subscriber_id, bot_id: cfg.bot.bot_id, scenario_id: startMatch ? cfg.scenario.scenario_id : '', event_type: startMatch ? 'start' : 'message_received', source: 'telegram_webhook', payload: message.text || '', telegram_update_id: update.update_id });
    if (!startMatch) return;
    if (!testUserAllowed(message.from.id)) {
      await recordEvent({ subscriber_id: subscriber.subscriber_id, bot_id: cfg.bot.bot_id, scenario_id: cfg.scenario.scenario_id, event_type: 'test_mode_blocked', source: 'telegram_webhook', payload: String(message.from.id), telegram_update_id: update.update_id });
      return;
    }
    await startSubscription(subscriber, startMatch[1] || cfg.scenario.start_parameter || '', cfg);
    await this.processDue();
  },

  async processDue(): Promise<void> {
    if (processing || !env.TELEGRAM_BOT_SPREADSHEET_ID) return;
    processing = true;
    try {
      const cfg = await config();
      const subscriptions = await rows(SHEETS.subscriptions, 'A1:R10000');
      const due = subscriptions.filter(item => item.status === 'active' && item.next_send_at && Date.parse(item.next_send_at) <= Date.now());
      for (const subscription of due) {
        try { await sendDueSubscription(subscription, cfg); }
        catch (error) { console.error('[TelegramRuntime] send failed', { subscriptionId: subscription.subscription_id, message: error instanceof Error ? error.message : String(error) }); }
      }
    } finally { processing = false; }
  },

  start(): void {
    if (timer || !env.TELEGRAM_BOT_SPREADSHEET_ID) return;
    timer = setInterval(() => void this.processDue(), env.TELEGRAM_BOT_SCHEDULER_INTERVAL_MS);
    timer.unref();
    void this.processDue();
    console.log('[TelegramRuntime] scheduler started', { testMode: env.TELEGRAM_BOT_TEST_MODE });
  },

  stop(): void { if (timer) clearInterval(timer); timer = null; },
};
