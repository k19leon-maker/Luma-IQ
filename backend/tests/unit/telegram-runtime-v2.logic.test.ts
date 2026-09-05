import { describe, expect, it } from 'vitest';
import type { ChatbotScenarioDefinitionV1 } from '../../src/contracts/chatbot-scenario.contract';
import {
  calculateWaitUntil,
  collectInputButtons,
  matchRuntimeEntrypoint,
  parseTelegramRuntimeUpdate,
  parseCollectedInput,
  renderTelegramTemplate,
  telegramDeliveryPayloadSchema,
} from '../../src/services/telegram-runtime-v2.logic';

const definition: ChatbotScenarioDefinitionV1 = {
  schemaVersion: '1.0',
  name: 'Test',
  timezone: 'Europe/Moscow',
  entrypoints: [
    { id: 'start', type: 'start', targetNodeId: 'message' },
    { id: 'bonus', type: 'start_parameter', value: 'bonus', targetNodeId: 'message' },
    { id: 'keyword', type: 'keyword', value: 'БОНУС', match: 'exact', caseSensitive: false, targetNodeId: 'message' },
  ],
  variables: [],
  nodes: [
    { id: 'message', type: 'send_message', text: 'Привет', parseMode: 'plain', disableWebPreview: false },
    { id: 'end', type: 'end' },
  ],
  edges: [{ id: 'next', fromNodeId: 'message', toNodeId: 'end' }],
  goals: [],
  metadata: { locale: 'ru', source: 'manual' },
};

describe('Telegram Runtime v2 logic', () => {
  it('parses /start deep-links only from private human messages', () => {
    const parsed = parseTelegramRuntimeUpdate({
      update_id: 501,
      message: {
        message_id: 1,
        date: 1_700_000_000,
        text: '/start bonus',
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Анна', username: 'anna' },
      },
    });

    expect(parsed).toMatchObject({
      telegramUpdateId: '501',
      telegramUserId: '42',
      telegramChatId: '42',
      trigger: { type: 'start', parameter: 'bonus' },
    });
    expect(parseTelegramRuntimeUpdate({
      update_id: 502,
      message: {
        message_id: 2,
        date: 1_700_000_001,
        text: '/start',
        chat: { id: -100, type: 'group' },
        from: { id: 42 },
      },
    })).toBeNull();
  });

  it('matches deep-link, default start and case-insensitive keyword entrypoints', () => {
    expect(matchRuntimeEntrypoint(definition, { type: 'start', text: '/start bonus', parameter: 'bonus' }))
      .toMatchObject({ entrypointId: 'bonus', source: 'telegram_deep_link', startParameter: 'bonus' });
    expect(matchRuntimeEntrypoint(definition, { type: 'start', text: '/start missing', parameter: 'missing' }))
      .toMatchObject({ entrypointId: 'start', source: 'telegram_start', startParameter: 'missing' });
    expect(matchRuntimeEntrypoint(definition, { type: 'keyword', text: 'бонус' }))
      .toMatchObject({ entrypointId: 'keyword', source: 'telegram_keyword' });
  });

  it('parses private callback queries and ignores callbacks without a private chat', () => {
    expect(parseTelegramRuntimeUpdate({
      update_id: 503,
      callback_query: {
        id: 'callback-503',
        from: { id: 42, first_name: 'Анна' },
        data: 'offer:accept',
        message: {
          message_id: 7,
          date: 1_700_000_002,
          chat: { id: 42, type: 'private' },
        },
      },
    })).toMatchObject({
      telegramUpdateId: '503',
      telegramUserId: '42',
      telegramChatId: '42',
      trigger: { type: 'callback', callbackQueryId: 'callback-503', data: 'offer:accept' },
    });

    expect(parseTelegramRuntimeUpdate({
      update_id: 504,
      callback_query: {
        id: 'callback-504',
        from: { id: 42 },
        data: 'offer:accept',
      },
    })).toBeNull();
  });

  it('builds bounded choice callbacks and validates collected values', () => {
    const choiceNode = {
      id: 'choose_goal',
      type: 'collect_input' as const,
      field: 'goal',
      inputType: 'choice' as const,
      prompt: 'Выберите цель',
      required: true,
      choices: ['Продажи', 'Подписчики'],
    };

    expect(collectInputButtons(choiceNode.choices)).toEqual([
      { type: 'callback', label: 'Продажи', callbackData: 'lqci:0' },
      { type: 'callback', label: 'Подписчики', callbackData: 'lqci:1' },
    ]);
    expect(parseCollectedInput(choiceNode, {
      type: 'callback',
      text: '',
      callbackQueryId: 'callback-choice',
      data: 'lqci:1',
    })).toEqual({ valid: true, value: 'Подписчики' });
    expect(parseCollectedInput(choiceNode, { type: 'keyword', text: 'продажи' }))
      .toEqual({ valid: true, value: 'Продажи' });

    expect(parseCollectedInput({ ...choiceNode, inputType: 'email', choices: undefined }, {
      type: 'keyword', text: 'Owner@Example.com',
    })).toEqual({ valid: true, value: 'owner@example.com' });
    expect(parseCollectedInput({ ...choiceNode, inputType: 'phone', choices: undefined }, {
      type: 'keyword', text: '+7 (999) 123-45-67',
    })).toEqual({ valid: true, value: '+79991234567' });
    expect(parseCollectedInput({ ...choiceNode, inputType: 'number', choices: undefined }, {
      type: 'keyword', text: '12,5',
    })).toEqual({ valid: true, value: 12.5 });
    expect(parseCollectedInput({ ...choiceNode, inputType: 'email', choices: undefined }, {
      type: 'keyword', text: 'не email',
    })).toMatchObject({ valid: false });
  });

  it('schedules the next 09:00 Moscow occurrence without a hard-coded UTC offset', () => {
    const schedule = {
      type: 'next_local_time' as const,
      localTime: '09:00',
      timezone: 'Europe/Moscow',
      minDelaySeconds: 60,
    };

    expect(calculateWaitUntil(schedule, new Date('2026-09-03T05:00:00.000Z')).toISOString())
      .toBe('2026-09-03T06:00:00.000Z');
    expect(calculateWaitUntil(schedule, new Date('2026-09-03T06:00:00.000Z')).toISOString())
      .toBe('2026-09-04T06:00:00.000Z');
  });

  it('renders known variables and rejects malformed delivery payloads', () => {
    expect(renderTelegramTemplate('Привет, {{ first_name }}! {{missing}}', { first_name: 'Анна' }))
      .toBe('Привет, Анна! ');
    expect(telegramDeliveryPayloadSchema.safeParse({
      kind: 'send_message',
      chatId: '42',
      text: 'Привет',
      parseMode: 'plain',
      disableWebPreview: false,
      buttons: [],
      nextNodeId: 'end',
      waitsForInteraction: false,
    }).success).toBe(true);
    expect(telegramDeliveryPayloadSchema.safeParse({ kind: 'resume' }).success).toBe(false);
  });
});
