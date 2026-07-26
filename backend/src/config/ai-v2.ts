import { env } from './env';

export const AI_MODEL_ALIASES = [
  'SOL',
  'TERRA',
  'LUNA',
  'TRANSCRIBE_MINI',
  'TRANSCRIBE_DIARIZE',
] as const;

export type AIModelAlias = typeof AI_MODEL_ALIASES[number];

export const AI_FEATURE_FLAG_KEYS = [
  'AI_ORCHESTRATION_V2',
  'AI_POINTS_V2',
  'AI_ROUTER_V2',
  'AI_BATCH_ENABLED',
  'AI_COST_RECONCILIATION',
  'AI_ADMIN_ECONOMICS_V2',
] as const;

export type AIFeatureFlagKey = typeof AI_FEATURE_FLAG_KEYS[number];

export const DEFAULT_MODEL_PROFILES: Record<AIModelAlias, {
  provider: 'OPENAI';
  actualModelId: string;
}> = {
  SOL: { provider: 'OPENAI', actualModelId: env.AI_MODEL_SOL },
  TERRA: { provider: 'OPENAI', actualModelId: env.AI_MODEL_TERRA },
  LUNA: { provider: 'OPENAI', actualModelId: env.AI_MODEL_LUNA },
  TRANSCRIBE_MINI: { provider: 'OPENAI', actualModelId: env.AI_MODEL_TRANSCRIBE_MINI },
  TRANSCRIBE_DIARIZE: { provider: 'OPENAI', actualModelId: env.AI_MODEL_TRANSCRIBE_DIARIZE },
};

export const DEFAULT_AI_FEATURE_FLAGS: Record<AIFeatureFlagKey, boolean> = {
  AI_ORCHESTRATION_V2: env.AI_ORCHESTRATION_V2,
  AI_POINTS_V2: env.AI_POINTS_V2,
  AI_ROUTER_V2: env.AI_ROUTER_V2,
  AI_BATCH_ENABLED: env.AI_BATCH_ENABLED,
  AI_COST_RECONCILIATION: env.AI_COST_RECONCILIATION,
  AI_ADMIN_ECONOMICS_V2: env.AI_ADMIN_ECONOMICS_V2,
};

export function isModelAlias(value: string): value is AIModelAlias {
  return (AI_MODEL_ALIASES as readonly string[]).includes(value);
}

export function isFeatureFlagKey(value: string): value is AIFeatureFlagKey {
  return (AI_FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}
