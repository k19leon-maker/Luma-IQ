import { describe, expect, it } from 'vitest';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../../src/config/ai-action-registry';
import { promptRegistry } from '../../src/prompts/registry';
import { aiActionResolverService } from '../../src/services/ai-action-resolver.service';

const cases: Array<{
  workflow: string;
  step: string;
  actionKey: AIActionKey;
  aliases: string[];
  points: number;
  inputs?: Record<string, unknown>;
}> = [
  { workflow: 'strategy.audience', step: 'generate', actionKey: 'audience', aliases: ['LUNA', 'TERRA', 'SOL', 'LUNA'], points: 25, inputs: { stepId: 1 } },
  { workflow: 'positioning.variants', step: 'generate', actionKey: 'positioning', aliases: ['TERRA', 'SOL', 'LUNA'], points: 20 },
  { workflow: 'strategy.utp', step: 'generate', actionKey: 'utp', aliases: ['TERRA', 'LUNA'], points: 20 },
  { workflow: 'strategy.offer', step: 'generate', actionKey: 'offer', aliases: ['TERRA', 'SOL', 'LUNA'], points: 30 },
  { workflow: 'strategy.social', step: 'generate', actionKey: 'social', aliases: ['TERRA', 'LUNA', 'TERRA'], points: 15 },
  { workflow: 'strategy.rebuild', step: 'generate', actionKey: 'strategy_rebuild', aliases: ['TERRA', 'SOL', 'LUNA'], points: 100 },
  { workflow: 'product.strategy', step: 'audit', actionKey: 'product_strategy_audit', aliases: ['TERRA', 'SOL', 'LUNA'], points: 60 },
];

describe('Stage 7 strategy workflow integration contracts', () => {
  it.each(cases)('$workflow.$step resolves to strict $actionKey pipeline', (item) => {
    const prompt = promptRegistry.get(item.workflow, item.step);
    const actionKey = aiActionResolverService.resolve({
      featureCode: prompt.feature,
      workflow: item.workflow,
      step: item.step,
      inputs: item.inputs ?? {},
    });
    const definition = AI_ACTION_DEFINITIONS[actionKey];

    expect(actionKey).toBe(item.actionKey);
    expect(definition.aiPoints).toBe(item.points);
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(item.aliases);
    expect(definition.fallbackPolicy).toEqual({ aliases: [], allowDowngrade: false });
    expect(prompt.validationRules).toBeDefined();
    expect(
      Boolean(prompt.validationRules.minLength)
      || Boolean(prompt.validationRules.requiredIncludes?.length)
      || Boolean(prompt.validationRules.requiredPatterns?.length),
    ).toBe(true);
  });

  it('uses SOL only for the decision stage', () => {
    for (const item of cases) {
      const solStages = AI_ACTION_DEFINITIONS[item.actionKey].pipeline
        .filter((stage) => stage.modelAlias === 'SOL')
        .map((stage) => stage.stage);
      if (item.aliases.includes('SOL')) {
        expect(solStages).toEqual(['decision']);
      } else {
        expect(solStages).toEqual([]);
      }
    }
  });
});
