import { z } from 'zod';
import {
  ChatbotScenarioDefinitionV1,
  ChatbotScenarioNode,
} from '../contracts/chatbot-scenario.contract';

export interface TelegramRuntimeUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramRuntimeChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramRuntimeUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: TelegramRuntimeChat;
    from?: TelegramRuntimeUser;
  };
  my_chat_member?: {
    chat: TelegramRuntimeChat;
    from: TelegramRuntimeUser;
    new_chat_member: { status: string };
  };
}

export type TelegramRuntimeTrigger =
  | { type: 'start'; text: string; parameter: string | null }
  | { type: 'keyword'; text: string }
  | { type: 'stop'; text: string }
  | { type: 'blocked'; text: '' }
  | { type: 'unblocked'; text: '' }
  | { type: 'message'; text: string };

export interface ParsedTelegramRuntimeUpdate {
  telegramUpdateId: string;
  telegramUserId: string;
  telegramChatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  trigger: TelegramRuntimeTrigger;
}

export interface RuntimeEntrypointMatch {
  entrypointId: string;
  targetNodeId: string;
  source: 'telegram_start' | 'telegram_deep_link' | 'telegram_keyword';
  startParameter: string | null;
}

const sendMessageDeliveryPayloadSchema = z.object({
  kind: z.literal('send_message'),
  chatId: z.string().min(1),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['plain', 'HTML', 'MarkdownV2']).default('plain'),
  disableWebPreview: z.boolean().default(false),
  buttons: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('url'), label: z.string(), url: z.string().url() }).strict(),
    z.object({ type: z.literal('callback'), label: z.string(), callbackData: z.string() }).strict(),
  ])).max(10).default([]),
  nextNodeId: z.string().nullable(),
  waitsForInteraction: z.boolean().default(false),
}).strict();

const resumeDeliveryPayloadSchema = z.object({
  kind: z.literal('resume'),
  targetNodeId: z.string().min(1),
}).strict();

export const telegramDeliveryPayloadSchema = z.discriminatedUnion('kind', [
  sendMessageDeliveryPayloadSchema,
  resumeDeliveryPayloadSchema,
]);

export type TelegramDeliveryPayload = z.infer<typeof telegramDeliveryPayloadSchema>;

const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/i;
const STOP_COMMAND = /^\/stop(?:@[A-Za-z0-9_]+)?\s*$/i;

export function parseTelegramRuntimeUpdate(input: unknown): ParsedTelegramRuntimeUpdate | null {
  if (!input || typeof input !== 'object') return null;
  const update = input as TelegramRuntimeUpdate;
  if (!Number.isInteger(update.update_id) || update.update_id < 0) return null;

  if (update.message?.chat.type === 'private' && update.message.from && !update.message.from.is_bot) {
    const text = update.message.text?.trim() ?? '';
    const start = text.match(START_COMMAND);
    const trigger: TelegramRuntimeTrigger = start
      ? { type: 'start', text, parameter: start[1] ?? null }
      : STOP_COMMAND.test(text)
        ? { type: 'stop', text }
        : text
          ? { type: 'keyword', text }
          : { type: 'message', text: '' };
    return {
      telegramUpdateId: String(update.update_id),
      telegramUserId: String(update.message.from.id),
      telegramChatId: String(update.message.chat.id),
      username: update.message.from.username ?? null,
      firstName: update.message.from.first_name ?? null,
      lastName: update.message.from.last_name ?? null,
      languageCode: update.message.from.language_code ?? null,
      trigger,
    };
  }

  if (update.my_chat_member?.chat.type === 'private') {
    const status = update.my_chat_member.new_chat_member.status;
    const blocked = status === 'kicked';
    const unblocked = status === 'member';
    if (!blocked && !unblocked) return null;
    const chat = update.my_chat_member.chat;
    return {
      telegramUpdateId: String(update.update_id),
      telegramUserId: String(chat.id),
      telegramChatId: String(chat.id),
      username: chat.username ?? null,
      firstName: chat.first_name ?? null,
      lastName: chat.last_name ?? null,
      languageCode: null,
      trigger: blocked ? { type: 'blocked', text: '' } : { type: 'unblocked', text: '' },
    };
  }

  return null;
}

export function matchRuntimeEntrypoint(
  definition: ChatbotScenarioDefinitionV1,
  trigger: TelegramRuntimeTrigger,
): RuntimeEntrypointMatch | null {
  if (trigger.type === 'start') {
    if (trigger.parameter) {
      const deepLink = definition.entrypoints.find((entrypoint) => (
        entrypoint.type === 'start_parameter' && entrypoint.value === trigger.parameter
      ));
      if (deepLink) {
        return {
          entrypointId: deepLink.id,
          targetNodeId: deepLink.targetNodeId,
          source: 'telegram_deep_link',
          startParameter: trigger.parameter,
        };
      }
    }
    const start = definition.entrypoints.find((entrypoint) => entrypoint.type === 'start');
    return start ? {
      entrypointId: start.id,
      targetNodeId: start.targetNodeId,
      source: 'telegram_start',
      startParameter: trigger.parameter,
    } : null;
  }

  if (trigger.type === 'keyword') {
    const keyword = definition.entrypoints.find((entrypoint) => {
      if (entrypoint.type !== 'keyword') return false;
      const actual = entrypoint.caseSensitive ? trigger.text : trigger.text.toLocaleLowerCase('ru-RU');
      const expected = entrypoint.caseSensitive ? entrypoint.value : entrypoint.value.toLocaleLowerCase('ru-RU');
      return entrypoint.match === 'contains' ? actual.includes(expected) : actual === expected;
    });
    return keyword ? {
      entrypointId: keyword.id,
      targetNodeId: keyword.targetNodeId,
      source: 'telegram_keyword',
      startParameter: null,
    } : null;
  }

  return null;
}

function partsAt(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsAt(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += desiredAsUtc - actualAsUtc;
  }
  return new Date(guess);
}

export function calculateWaitUntil(
  schedule: Extract<ChatbotScenarioNode, { type: 'wait' }>['schedule'],
  from = new Date(),
): Date {
  if (schedule.type === 'duration') {
    return new Date(from.getTime() + schedule.seconds * 1000);
  }

  const threshold = new Date(from.getTime() + schedule.minDelaySeconds * 1000);
  const local = partsAt(threshold, schedule.timezone);
  const [hour, minute] = schedule.localTime.split(':').map(Number);
  let candidate = zonedLocalToUtc(local.year, local.month, local.day, hour, minute, schedule.timezone);
  if (candidate.getTime() < threshold.getTime()) {
    const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    candidate = zonedLocalToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      hour,
      minute,
      schedule.timezone,
    );
  }
  return candidate;
}

export function renderTelegramTemplate(text: string, variables: Record<string, unknown>): string {
  return text.replace(/{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g, (_match, name: string) => {
    const value = variables[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function unconditionalNextNodeId(
  definition: ChatbotScenarioDefinitionV1,
  nodeId: string,
): string | null {
  return definition.edges.find((edge) => edge.fromNodeId === nodeId && !edge.condition)?.toNodeId ?? null;
}
