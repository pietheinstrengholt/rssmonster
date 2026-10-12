import { describe, expect, it } from 'vitest';
import { canonicalToneScore, withLegacyToneScore } from '../src/classifications/toneScoreContract.js';

describe('tone score compatibility', () => {
  it.each([null, undefined, [], 0])('leaves non-records unchanged (%j)', value => {
    expect(canonicalToneScore(value)).toBe(value);
    expect(withLegacyToneScore(value)).toBe(value);
  });
  it('canonicalizes old results without mutating them or retaining duplicate state', () => {
    const legacy = { sentimentScore: 80, qualityScore: 40 };
    expect(canonicalToneScore(legacy)).toEqual({ toneScore: 80, qualityScore: 40 });
    expect(legacy).toEqual({ sentimentScore: 80, qualityScore: 40 });
    expect(canonicalToneScore({ qualityScore: 40 })).toEqual({ qualityScore: 40 });
  });
  it.each([0, null, 70])('prefers canonical values (%j) and emits equal response aliases', toneScore => {
    const result = { toneScore, sentimentScore: 90, qualityScore: 40 };
    expect(canonicalToneScore(result)).toEqual({ toneScore, qualityScore: 40 });
    expect(withLegacyToneScore(result)).toEqual({ toneScore, sentimentScore: toneScore, qualityScore: 40 });
  });
});
