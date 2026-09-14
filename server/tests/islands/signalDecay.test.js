import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeArticleSignals } from '../../services/islands/islandArticleProfiles.js';
import { behaviorRecencyWeight, SIGNAL_HALF_LIFE_DAYS } from '../../services/islands/islandVectorUtils.js';

const now = Date.parse('2026-09-14T12:00:00Z');
const daysAgo = days => new Date(now - days * 86400000);
const signals = [
  { name: 'click', field: 'lastClickedAt', state: { clickedAmount: 1 }, weight: 2, halfLife: 30, key: 'positiveScore' },
  { name: 'deep read', field: 'lastMeaningfulReadAt', state: { attentionBucket: 3 }, weight: 1, halfLife: 90, key: 'positiveScore' },
  { name: 'favorite', field: 'favoritedAt', state: { favoriteInd: 1 }, weight: 4, halfLife: 365, key: 'positiveScore' },
  { name: 'more-like-this', field: 'positiveFeedbackAt', state: { positiveInd: 1 }, weight: 8, halfLife: 730, key: 'positiveScore' },
  { name: 'not-interested', field: 'negativeFeedbackAt', state: { negativeInd: 1 }, weight: 8, halfLife: 365, key: 'negativeScore' }
];
const score = (signal, age) => computeArticleSignals({ publishedAt: daysAgo(0), ...signal.state, [signal.field]: daysAgo(age) })[signal.key];

describe('signal-specific Island decay', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => vi.restoreAllMocks());

  it.each(signals)('$name preserves its raw weight and halves on its own interaction clock', signal => {
    expect(SIGNAL_HALF_LIFE_DAYS[signal.field]).toBe(signal.halfLife);
    expect(score(signal, 0)).toBe(signal.weight);
    expect(score(signal, signal.halfLife)).toBeCloseTo(signal.weight / 2, 10);
    expect(score(signal, signal.halfLife * 2)).toBeCloseTo(signal.weight / 4, 10);
    expect(score(signal, 7)).toBeGreaterThan(score(signal, 90));
  });

  it.each(signals)('$name uses publication only for missing legacy clocks, and fresh interaction on old content stays fresh', signal => {
    const legacy = { publishedAt: daysAgo(signal.halfLife), ...signal.state, [signal.field]: null };
    expect(computeArticleSignals(legacy)[signal.key]).toBeCloseTo(signal.weight / 2, 10);
    expect(computeArticleSignals({ ...legacy, publishedAt: new Date('2022-01-01'), [signal.field]: daysAgo(0) })[signal.key]).toBe(signal.weight);
  });

  it.each([7, 30, 90, 180, 365])('retains strong explicit evidence longer than implicit evidence after %i days', age => {
    const [click, deepRead, favorite, positive] = signals.map(signal => score(signal, age) / signal.weight);
    expect(click).toBeLessThan(deepRead);
    expect(deepRead).toBeLessThan(favorite);
    expect(favorite).toBeLessThan(positive);
  });

  it('decays independently before summing and keeps capped click magnitude and signal snapshots', () => {
    const result = computeArticleSignals({ publishedAt: daysAgo(0), clickedAmount: 20, lastClickedAt: daysAgo(30),
      attentionBucket: 4, lastMeaningfulReadAt: daysAgo(180), favoriteInd: 1, favoritedAt: daysAgo(0),
      positiveInd: 1, positiveFeedbackAt: daysAgo(730) });
    expect(result.positiveScore).toBe(6 / 2 + 1 / 4 + 4 + 8 / 2);
    expect(result.positiveSignals).toEqual({ clicks: 3, deepReads: 1, stars: 1, positives: 1, negatives: 0 });
    const negative = computeArticleSignals({ negativeInd: 1, negativeFeedbackAt: daysAgo(365),
      positiveInd: 1, positiveFeedbackAt: daysAgo(0), favoriteInd: 1, favoritedAt: daysAgo(0) });
    expect(negative.positiveScore).toBe(4);
    expect(negative.negativeScore).toBe(4);
  });

  it('lets negative evidence approach zero without retaining a permanent floor', () => {
    const negative = signals.at(-1);
    expect(score(negative, 365 * 20)).toBeLessThan(0.00001);
    expect(score(negative, 365 * 20)).toBeGreaterThan(0);
    expect(behaviorRecencyWeight(daysAgo(30 * 20), 30)).toBeCloseTo(2 ** -20, 12);
  });
});
