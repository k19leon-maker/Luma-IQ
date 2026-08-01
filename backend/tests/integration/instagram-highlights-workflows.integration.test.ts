import { describe, expect, it } from 'vitest';
import { AI_ACTION_DEFINITIONS } from '../../src/config/ai-action-registry';
import { AI_ACTION_COSTS } from '../../src/config/ai-actions';
import { promptRegistry } from '../../src/prompts/registry';

const cases = [
  ['instagram.highlights', 'generate', 'instagram_highlights_generate', 40],
  ['instagram.highlight', 'scenario', 'instagram_highlight_scenario_generate', 20],
  ['instagram.highlight', 'improve', 'instagram_highlight_improve', 10],
  ['instagram.story', 'improve', 'instagram_story_improve', 3],
] as const;

describe('Instagram Highlights workflow contracts', () => {
  it.each(cases)('%s.%s uses action %s', (workflow, step, actionKey, points) => {
    const prompt = promptRegistry.get(workflow, step);
    expect(prompt.feature).toBe(actionKey);
    expect(prompt.validationRules.structuredOutput).toBe('json');
    expect(AI_ACTION_COSTS[actionKey]).toBe(points);
    expect(AI_ACTION_DEFINITIONS[actionKey].aiPoints).toBe(points);
  });
});
