import { describe, expect, it } from 'vitest';
import { roundRecommendedAiPoints } from '../../src/services/ai-economics-v2.service';

describe('AI Economics V2 recommendation rounding', () => {
  it.each([
    [1, 5],
    [41, 45],
    [50, 50],
    [51, 60],
    [241, 250],
    [251, 275],
    [612, 625],
  ])('rounds %s points to the configured range step', (value, expected) => {
    expect(roundRecommendedAiPoints(value)).toBe(expected);
  });
});
