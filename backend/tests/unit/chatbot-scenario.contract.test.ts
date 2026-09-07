import { describe, expect, it } from 'vitest';
import {
  assertValidChatbotScenarioDefinition,
  validateChatbotScenarioDefinition,
} from '../../src/contracts/chatbot-scenario.contract';

const validScenario = {
  schemaVersion: '1.0',
  name: 'Бонус и серия сообщений',
  timezone: 'Europe/Moscow',
  entrypoints: [
    {
      id: 'bonus_keyword',
      type: 'keyword',
      value: 'БОНУС',
      match: 'exact',
      caseSensitive: false,
      targetNodeId: 'send_bonus',
    },
  ],
  variables: [],
  nodes: [
    {
      id: 'send_bonus',
      type: 'send_message',
      text: 'Здравствуйте, {{first_name}}! Заберите бонус по ссылке.',
      parseMode: 'plain',
      disableWebPreview: false,
      buttons: [
        { type: 'url', label: 'Получить бонус', url: 'https://lumaiq.ru/bonus' },
      ],
    },
    {
      id: 'wait_until_0900',
      type: 'wait',
      schedule: {
        type: 'next_local_time',
        localTime: '09:00',
        timezone: 'Europe/Moscow',
        minDelaySeconds: 60,
      },
    },
    {
      id: 'send_day_2',
      type: 'send_message',
      text: 'День 2. Продолжаем цепочку.',
      parseMode: 'plain',
      disableWebPreview: false,
    },
    { id: 'finish', type: 'end', reason: 'Серия завершена' },
  ],
  edges: [
    { id: 'bonus_to_wait', fromNodeId: 'send_bonus', toNodeId: 'wait_until_0900' },
    { id: 'wait_to_day_2', fromNodeId: 'wait_until_0900', toNodeId: 'send_day_2' },
    { id: 'day_2_to_end', fromNodeId: 'send_day_2', toNodeId: 'finish' },
  ],
  goals: [],
  metadata: { locale: 'ru', source: 'manual' },
} as const;

describe('Chatbot ScenarioDefinitionV1 contract', () => {
  it('accepts a keyword funnel with a 09:00 Moscow wait', () => {
    const report = validateChatbotScenarioDefinition(validScenario);

    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.stats).toEqual({
      nodeCount: 4,
      edgeCount: 3,
      maximumHorizonSeconds: 86_400,
    });
    expect(report.definition?.schemaVersion).toBe('1.0');
  });

  it('accepts a private media asset reference without embedding file contents', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.nodes[0] = {
      id: 'send_bonus',
      type: 'send_media',
      mediaType: 'document',
      assetId: '0a8eb7ea-1b50-4eb9-b67b-1ce04bd0d0fd',
      caption: 'Бонус для {{first_name}}',
      parseMode: 'plain',
    };

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(true);
    expect(report.definition?.nodes[0]).toMatchObject({
      type: 'send_media',
      assetId: '0a8eb7ea-1b50-4eb9-b67b-1ce04bd0d0fd',
    });
  });

  it('rejects unknown executable actions at the schema boundary', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.nodes[0].type = 'run_javascript';

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code.startsWith('schema.'))).toBe(true);
  });

  it('rejects case-insensitive duplicate keyword triggers', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.entrypoints.push({
      id: 'bonus_keyword_duplicate',
      type: 'keyword',
      value: 'бонус',
      match: 'exact',
      caseSensitive: false,
      targetNodeId: 'send_bonus',
    });

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'entrypoint.duplicate_trigger',
    }));
  });

  it('rejects graph cycles in V1', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.edges[2] = {
      id: 'day_2_to_start',
      fromNodeId: 'send_day_2',
      toNodeId: 'send_bonus',
    };

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'graph.cycle_not_allowed',
    }));
    expect(report.issues.some((issue) => issue.code === 'graph.no_path_to_end')).toBe(true);
  });

  it('requires a matching transition for every callback button', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.nodes[0].buttons = [
      { type: 'callback', label: 'Продолжить', callbackData: 'continue' },
    ];

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'button.missing_edge',
    }));
  });

  it('rejects undeclared template variables and writable fields', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.nodes[0].text = 'Ваш промокод: {{promo_code}}';
    scenario.nodes.splice(1, 0, {
      id: 'save_campaign',
      type: 'set_field',
      field: 'campaign_name',
      value: 'bonus',
    });
    scenario.edges = [
      { id: 'bonus_to_save', fromNodeId: 'send_bonus', toNodeId: 'save_campaign' },
      { id: 'save_to_wait', fromNodeId: 'save_campaign', toNodeId: 'wait_until_0900' },
      ...scenario.edges.slice(1),
    ];

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'variable.unknown_template',
      'variable.unknown_writable_field',
    ]));
  });

  it('rejects invalid timezones and redeclared built-in variables', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.timezone = 'Moscow/Nowhere';
    scenario.variables = [{ name: 'first_name', type: 'string', required: false }];

    const report = validateChatbotScenarioDefinition(scenario);

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code.startsWith('schema.'))).toBe(true);

    scenario.timezone = 'Europe/Moscow';
    const reservedNameReport = validateChatbotScenarioDefinition(scenario);
    expect(reservedNameReport.issues).toContainEqual(expect.objectContaining({
      code: 'variable.reserved_name',
    }));
  });

  it('throws a concise error when an invalid graph is asserted', () => {
    const scenario = structuredClone(validScenario) as any;
    scenario.entrypoints[0].targetNodeId = 'missing_node';

    expect(() => assertValidChatbotScenarioDefinition(scenario)).toThrow(
      /Invalid chatbot scenario/,
    );
  });
});
