import { describe, expect, it } from 'vitest';
import { AI_ACTION_DEFINITIONS } from '../../src/config/ai-action-registry';
import { AI_ACTION_COSTS } from '../../src/config/ai-actions';
import { promptRegistry } from '../../src/prompts/registry';

const workflows = [
  ['generate', 'tg_channel_description_generate', 5],
  ['improve', 'tg_channel_description_improve', 2],
] as const;

describe('Telegram channel description workflow contracts', () => {
  it.each(workflows)('tg-channel.description.%s uses a separate action and price', (step, actionKey, points) => {
    const prompt = promptRegistry.get('tg-channel.description', step);

    expect(prompt.feature).toBe(actionKey);
    expect(prompt.validationRules.structuredOutput).toBe('json');
    expect(AI_ACTION_COSTS[actionKey]).toBe(points);
    expect(AI_ACTION_DEFINITIONS[actionKey].aiPoints).toBe(points);
    expect(AI_ACTION_DEFINITIONS[actionKey].contextBudget).toBeLessThanOrEqual(5_200);
  });
});
