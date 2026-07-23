import { describe, expect, it } from 'vitest';
import {
  aiPointsForGeneration,
  getCastDevAnalysisCost,
  getCastDevTranscriptionCost,
} from '../../src/config/ai-actions';

describe('ai action point costs', () => {
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
});
