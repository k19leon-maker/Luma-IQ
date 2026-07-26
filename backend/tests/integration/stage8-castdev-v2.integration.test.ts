import { describe, expect, it } from 'vitest';
import { AI_ACTION_COSTS, featureCodeToAiAction } from '../../src/config/ai-actions';
import { AI_ACTION_DEFINITIONS } from '../../src/config/ai-action-registry';
import { promptRegistry } from '../../src/prompts/registry';
import { selectNextCastDevQueueIndex } from '../../src/services/castdev-transcription-queue.service';

describe('Stage 8 CustDev V2 contracts', () => {
  it('routes transcription through MINI without an implicit expensive fallback', () => {
    const definition = AI_ACTION_DEFINITIONS.castdev_transcription;
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(['TRANSCRIBE_MINI']);
    expect(definition.fallbackPolicy).toEqual({ aliases: [], allowDowngrade: false });
  });

  it('uses LUNA to normalize and TERRA to analyze an interview', () => {
    const definition = AI_ACTION_DEFINITIONS.castdev_analysis;
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(['LUNA', 'TERRA']);
    expect(definition.pipeline.map((stage) => stage.stage)).toEqual(['normalize', 'analysis']);
    expect(definition.fallbackPolicy).toEqual({ aliases: [], allowDowngrade: false });
  });

  it('uses structured reports for TERRA to SOL synthesis', () => {
    const definition = AI_ACTION_DEFINITIONS.castdev_synthesis;
    expect(definition.pipeline.map((stage) => stage.modelAlias)).toEqual(['TERRA', 'SOL']);
    expect(definition.pipeline.map((stage) => stage.stage)).toEqual(['aggregate', 'synthesis']);
    expect(definition.aiPoints).toBe(100);
    expect(definition.fallbackPolicy).toEqual({ aliases: [], allowDowngrade: false });

    const prompt = promptRegistry.get('castdev.synthesis', 'generate');
    expect(prompt.feature).toBe('castdev_synthesis');
    expect(prompt.artifactType).toBe('castdev_synthesis');
    expect(prompt.userPromptBuilder({
      inputs: { recordsCount: 5, reports: '[{"summary":"A"}]' },
      context: {} as never,
    })).not.toContain('transcriptText');
  });

  it('keeps transcription, analysis and synthesis as separate ledger actions', () => {
    expect(featureCodeToAiAction('castdev_transcription')).toBe('castdev_transcription');
    expect(featureCodeToAiAction('castdev_analysis')).toBe('castdev_analysis');
    expect(featureCodeToAiAction('castdev_synthesis')).toBe('castdev_synthesis');
    expect(AI_ACTION_COSTS.castdev_transcription).toBe(20);
    expect(AI_ACTION_COSTS.castdev_analysis).toBe(40);
    expect(AI_ACTION_COSTS.castdev_synthesis).toBe(100);
  });

  it('allows another user to run while the first user already has an active file', () => {
    const index = selectNextCastDevQueueIndex([
      { userId: 'user-a' },
      { userId: 'user-b' },
      { userId: 'user-a' },
    ], new Set(['user-a']));
    expect(index).toBe(1);
  });
});
