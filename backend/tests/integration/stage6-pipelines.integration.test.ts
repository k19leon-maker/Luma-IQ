import { describe, expect, it } from 'vitest';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../../src/config/ai-action-registry';
import { promptRegistry } from '../../src/prompts/registry';
import { aiActionResolverService } from '../../src/services/ai-action-resolver.service';

type Stage6Case = {
  workflow: string;
  step: string;
  inputs?: Record<string, unknown>;
  actionKey: AIActionKey;
  aliases: string[];
  aiPoints: number;
};

const cases: Stage6Case[] = [
  { workflow: 'product.main', step: 'build', actionKey: 'product_main', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 60 },
  { workflow: 'product.mini', step: 'build', actionKey: 'product_mini', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 80 },
  { workflow: 'leadmagnet', step: 'build', actionKey: 'lead_magnet', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 70 },
  { workflow: 'chatbot.chain', step: 'generate', actionKey: 'chatbot_scenario', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 30 },
  { workflow: 'tg-channel', step: 'plan', actionKey: 'tg_channel_plan', aliases: ['TERRA', 'LUNA'], aiPoints: 40 },
  { workflow: 'posts.post', step: 'write', inputs: { intent: 'selling' }, actionKey: 'selling_post', aliases: ['TERRA', 'LUNA'], aiPoints: 10 },
  { workflow: 'articles.article', step: 'write', actionKey: 'content_article', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 30 },
  { workflow: 'video.script', step: 'write', inputs: { intent: 'education' }, actionKey: 'youtube_script', aliases: ['LUNA'], aiPoints: 35 },
  { workflow: 'video.script', step: 'write', inputs: { intent: 'selling' }, actionKey: 'youtube_script_selling', aliases: ['TERRA', 'LUNA', 'TERRA'], aiPoints: 50 },
];

describe('Stage 6 workflow integration contracts', () => {
  it.each(cases)('$workflow.$step resolves to $actionKey with one fixed price', (item) => {
    const prompt = promptRegistry.get(item.workflow, item.step);
    const actionKey = aiActionResolverService.resolve({
      featureCode: prompt.feature,
      workflow: item.workflow,
      step: item.step,
      inputs: item.inputs ?? {},
    });
    const definition = AI_ACTION_DEFINITIONS[actionKey];

    expect(actionKey).toBe(item.actionKey);
    expect(definition.aiPoints).toBe(item.aiPoints);
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(item.aliases);
    expect(prompt.validationRules).toBeDefined();
  });

  it.each([
    ['product.main', 'edit', 'product_main_edit', 10],
    ['product.mini', 'edit', 'product_mini_edit', 10],
    ['leadmagnet', 'edit', 'lead_magnet_edit', 10],
  ] as const)('%s.%s uses a separate edit action', (workflow, step, expectedAction, expectedPoints) => {
    const prompt = promptRegistry.get(workflow, step);
    const actionKey = aiActionResolverService.resolve({
      featureCode: prompt.feature,
      workflow,
      step,
      inputs: {},
    });

    expect(actionKey).toBe(expectedAction);
    expect(AI_ACTION_DEFINITIONS[actionKey].aiPoints).toBe(expectedPoints);
    expect(AI_ACTION_DEFINITIONS[actionKey].pipeline).toHaveLength(1);
  });
});
