import { describe, expect, it } from 'vitest';
import {
  actionKeyForFeature,
  AI_ACTION_DEFINITIONS,
  LEGACY_FEATURE_TO_ACTION,
} from '../../src/config/ai-action-registry';
import { AI_MODEL_ALIASES, DEFAULT_MODEL_PROFILES } from '../../src/config/ai-v2';
import { modelRegistryService } from '../../src/services/model-registry.service';

describe('AI V2 registries', () => {
  it('maps every legacy feature to an existing action definition', () => {
    for (const [featureCode, actionKey] of Object.entries(LEGACY_FEATURE_TO_ACTION)) {
      expect(actionKeyForFeature(featureCode)).toBe(actionKey);
      expect(AI_ACTION_DEFINITIONS[actionKey]).toBeDefined();
    }
  });

  it('fails closed for unknown action keys', () => {
    expect(() => actionKeyForFeature('unpriced_future_action')).toThrow('UNKNOWN_AI_ACTION');
  });

  it('defines every required model alias with a server-side model ID', () => {
    for (const alias of AI_MODEL_ALIASES) {
      expect(DEFAULT_MODEL_PROFILES[alias].actualModelId).not.toBe('');
      expect(modelRegistryService.fallback(alias).actualModelId).toBe(DEFAULT_MODEL_PROFILES[alias].actualModelId);
    }
  });

  it('stores complete execution policy for each action', () => {
    for (const definition of Object.values(AI_ACTION_DEFINITIONS)) {
      expect(definition.pipeline.length).toBeGreaterThan(0);
      expect(definition.contextBudget).toBeGreaterThanOrEqual(0);
      expect(definition.outputLimit).toBeGreaterThanOrEqual(0);
      expect(definition.retryPolicy.maxAttempts).toBeGreaterThan(0);
      expect(definition.aiPoints).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    ['product_main', ['TERRA', 'LUNA', 'TERRA'], [2_500, 10_000, 12_000]],
    ['product_mini', ['TERRA', 'LUNA', 'TERRA'], [2_500, 9_000, 10_000]],
    ['lead_magnet', ['TERRA', 'LUNA', 'TERRA'], [2_500, 10_000, 12_000]],
    ['chatbot_scenario', ['TERRA', 'LUNA', 'TERRA'], [2_000, 8_000, 9_000]],
    ['tg_channel_plan', ['TERRA', 'LUNA'], [2_000, 8_000]],
    ['selling_post', ['TERRA', 'LUNA'], [1_500, 4_000]],
    ['content_article', ['TERRA', 'LUNA', 'TERRA'], [2_000, 10_000, 12_000]],
    ['youtube_script_selling', ['TERRA', 'LUNA', 'TERRA'], [1_800, 9_000, 10_000]],
  ] as const)('defines the Stage 6 pipeline contract for %s', (actionKey, aliases, outputLimits) => {
    const definition = AI_ACTION_DEFINITIONS[actionKey];
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(aliases);
    expect(definition.pipeline.map((stage) => stage.outputLimit ?? definition.outputLimit)).toEqual(outputLimits);
  });

  it('keeps ordinary video scripts on one LUNA stage', () => {
    expect(AI_ACTION_DEFINITIONS.youtube_script.pipeline.map((stage) => stage.modelAlias)).toEqual(['LUNA']);
  });

  it.each([
    ['audience', ['LUNA', 'TERRA', 'SOL', 'LUNA']],
    ['positioning', ['TERRA', 'SOL', 'LUNA']],
    ['utp', ['TERRA', 'LUNA']],
    ['offer', ['TERRA', 'SOL', 'LUNA']],
    ['social', ['TERRA', 'LUNA', 'TERRA']],
    ['strategy_rebuild', ['TERRA', 'SOL', 'LUNA']],
    ['product_strategy_audit', ['TERRA', 'SOL', 'LUNA']],
  ] as const)('defines the Stage 7 strategic pipeline for %s without downgrade fallback', (actionKey, aliases) => {
    const definition = AI_ACTION_DEFINITIONS[actionKey];
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(aliases);
    expect(definition.fallbackPolicy).toEqual({ aliases: [], allowDowngrade: false });
  });
});
