import type { AIActionDefinition, AIActionStage } from '../config/ai-action-registry';
import type { AIModelAlias } from '../config/ai-v2';
import { modelRegistryService, type ResolvedModelProfile } from './model-registry.service';

const QUALITY_RANK: Record<AIModelAlias, number> = {
  SOL: 3,
  TERRA: 2,
  LUNA: 1,
  TRANSCRIBE_MINI: 1,
  TRANSCRIBE_DIARIZE: 2,
};

function deduplicate<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export type ModelRouteDecision = {
  stage: string;
  requestedAlias: AIModelAlias;
  selectedAlias: AIModelAlias;
  provider: ResolvedModelProfile['provider'];
  actualModelId: string;
  profileVersionId: string | null;
  profileSource: ResolvedModelProfile['source'];
  fallback: boolean;
  downgrade: boolean;
  reason: 'primary' | 'same_profile_retry' | 'explicit_fallback';
  candidateIndex: number;
};

function candidates(definition: AIActionDefinition, stage: AIActionStage): Array<{
  alias: AIModelAlias;
  reason: ModelRouteDecision['reason'];
}> {
  const route: Array<{ alias: AIModelAlias; reason: ModelRouteDecision['reason'] }> = [
    { alias: stage.modelAlias, reason: 'primary' },
  ];
  if (definition.retryPolicy.retrySameProfile && definition.retryPolicy.maxAttempts > 1) {
    route.push({ alias: stage.modelAlias, reason: 'same_profile_retry' });
  }
  for (const alias of definition.fallbackPolicy.aliases) {
    if (alias === stage.modelAlias) continue;
    route.push({ alias, reason: 'explicit_fallback' });
  }
  const uniqueByReason = route.filter((item, index) => route.findIndex((candidate) => (
    candidate.alias === item.alias && candidate.reason === item.reason
  )) === index);
  return uniqueByReason.slice(
    0,
    Math.max(1, definition.retryPolicy.maxAttempts + definition.fallbackPolicy.aliases.length),
  );
}

export const modelRouterService = {
  listCandidates(definition: AIActionDefinition, stage: AIActionStage) {
    return deduplicate(candidates(definition, stage).map((candidate) => candidate.alias));
  },

  async routeForAttempt(input: {
    definition: AIActionDefinition;
    stage: AIActionStage;
    attemptIndex: number;
  }): Promise<ModelRouteDecision> {
    const route = candidates(input.definition, input.stage);
    const candidate = route[input.attemptIndex];
    if (!candidate) {
      throw Object.assign(new Error(`MODEL_ROUTE_EXHAUSTED: ${input.stage.stage}`), {
        code: 'MODEL_ROUTE_EXHAUSTED',
      });
    }
    const downgrade = QUALITY_RANK[candidate.alias] < QUALITY_RANK[input.stage.modelAlias];
    if (downgrade && !input.definition.fallbackPolicy.allowDowngrade) {
      throw Object.assign(
        new Error(`MODEL_DOWNGRADE_BLOCKED: ${input.stage.modelAlias} -> ${candidate.alias}`),
        { code: 'MODEL_DOWNGRADE_BLOCKED' },
      );
    }
    const profile = await modelRegistryService.resolve(candidate.alias);
    return {
      stage: input.stage.stage,
      requestedAlias: input.stage.modelAlias,
      selectedAlias: candidate.alias,
      provider: profile.provider,
      actualModelId: profile.actualModelId,
      profileVersionId: profile.versionId,
      profileSource: profile.source,
      fallback: candidate.reason === 'explicit_fallback',
      downgrade,
      reason: candidate.reason,
      candidateIndex: input.attemptIndex,
    };
  },
};
