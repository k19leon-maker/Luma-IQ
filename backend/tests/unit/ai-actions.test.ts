import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_COSTS,
  aiPointsForGeneration,
  getCastDevAnalysisCost,
  getCastDevTranscriptionCost,
} from '../../src/config/ai-actions';

describe('ai action point costs', () => {
  it('charges Instagram generation and improvement as separate actions', () => {
    expect(AI_ACTION_COSTS.instagram_profile_generate).toBe(15);
    expect(AI_ACTION_COSTS.instagram_profile_improve).toBe(5);
    expect(AI_ACTION_COSTS.instagram_highlights_generate).toBe(40);
    expect(AI_ACTION_COSTS.instagram_highlight_scenario_generate).toBe(20);
    expect(AI_ACTION_COSTS.instagram_highlight_improve).toBe(10);
    expect(AI_ACTION_COSTS.instagram_story_improve).toBe(3);
  });

  it('charges Telegram idea improvement separately from manual editing', () => {
    expect(AI_ACTION_COSTS.tg_channel_idea_improve).toBe(2);
  });

  it('calculates flexible CustDev transcription costs by duration', () => {
    expect(getCastDevTranscriptionCost(null)).toBe(20);
    expect(getCastDevTranscriptionCost(10 * 60)).toBe(10);
    expect(getCastDevTranscriptionCost(30 * 60)).toBe(20);
    expect(getCastDevTranscriptionCost(60 * 60)).toBe(35);
    expect(getCastDevTranscriptionCost(90 * 60)).toBe(50);
    expect(getCastDevTranscriptionCost(91 * 60)).toBe(70);
  });

  it('calculates flexible CustDev analysis costs by transcript length', () => {
    expect(getCastDevAnalysisCost(10_000)).toBe(20);
    expect(getCastDevAnalysisCost(30_000)).toBe(40);
    expect(getCastDevAnalysisCost(60_000)).toBe(70);
    expect(getCastDevAnalysisCost(100_000)).toBe(100);
    expect(getCastDevAnalysisCost(100_001)).toBe(140);
  });

  it('uses CustDev metadata override in generation accounting', () => {
    expect(aiPointsForGeneration('castdev_analysis', { transcriptChars: 8_000 })).toBe(20);
    expect(aiPointsForGeneration('castdev_analysis', { transcriptChars: 40_000 })).toBe(70);
    expect(aiPointsForGeneration('castdev_transcription', { durationSec: 75 * 60 })).toBe(50);
    expect(aiPointsForGeneration('castdev_analysis', { castdevAiPoints: 33 })).toBe(33);
  });

  it('prices case extraction by confirmed source text length', () => {
    expect(aiPointsForGeneration('cases_extract_case', { transcriptChars: 8_000 })).toBe(20);
    expect(aiPointsForGeneration('cases_extract_case', { transcriptChars: 40_000 })).toBe(70);
    expect(aiPointsForGeneration('cases_extract_case', { castdevAiPoints: 40 })).toBe(40);
    expect(AI_ACTION_COSTS.cases_generate_marketing_insights).toBe(5);
  });

  it('prices case voice transcription by the CustDev duration policy', () => {
    expect(AI_ACTION_COSTS.cases_voice_transcription).toBe(20);
    expect(aiPointsForGeneration('cases_voice_transcription', { durationSec: 5 * 60 })).toBe(10);
    expect(aiPointsForGeneration('cases_voice_transcription', { durationSec: 30 * 60 })).toBe(20);
    expect(aiPointsForGeneration('cases_voice_transcription', { castdevAiPoints: 35 })).toBe(35);
  });
});
