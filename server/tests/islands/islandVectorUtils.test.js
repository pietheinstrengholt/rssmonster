import {
  addPositiveSignals,
  blendIslandVector,
  buildPositiveSignalsAccumulator,
  isStaleIsland,
  mergePositiveSignals,
  normalizePositiveSignals,
  resolveTaxonomyDisplayName,
  sortIslandsByWeight,
  behaviorRecencyWeight
} from '../../services/islands/islandVectorUtils.js';

describe('island vector utilities', () => {
  it('sorts islands by descending weight and ascending id', () => {
    const islands = [
      { id: 3, weight: 0.2 },
      { id: 2, weight: 0.8 },
      { id: 1, weight: 0.8 }
    ];

    expect(sortIslandsByWeight(islands).map(island => island.id)).toEqual([1, 2, 3]);
  });

  it('blends vectors and falls back safely when either vector is unusable', () => {
    expect(blendIslandVector(null, [3, 4])).toEqual([0.6, 0.8]);
    expect(blendIslandVector([3, 4], null)).toEqual([0.6, 0.8]);
    expect(blendIslandVector([1, 0], [0, 1, 0])).toEqual([0, 1, 0]);
    expect(blendIslandVector([1, 0], [0, 1], 0.5)).toEqual([
      0.7071067811865475,
      0.7071067811865475
    ]);
  });

  it('gives unusable dates no recency weight', () => {
    expect(behaviorRecencyWeight(null, 30)).toBe(0);
    expect(behaviorRecencyWeight('invalid', 30)).toBe(0);
    expect(behaviorRecencyWeight(new Date(Date.now() + 86_400_000), 30)).toBe(0);
    expect(behaviorRecencyWeight(new Date('2000-01-01T00:00:00.000Z'), 30)).toBeLessThan(0.00001);
    for (const invalid of [0, -1, Infinity, NaN]) expect(() => behaviorRecencyWeight(new Date(), invalid)).toThrow(RangeError);
  });

  it('normalizes, adds, and merges positive signal counters', () => {
    const accumulator = buildPositiveSignalsAccumulator();
    addPositiveSignals(accumulator, { positives: 1, stars: 2, clicks: 3, deepReads: 4, negatives: 5 });

    expect(accumulator).toEqual({ positives: 1, stars: 2, clicks: 3, deepReads: 4, negatives: 5 });
    expect(normalizePositiveSignals({ stars: '2', clicks: null })).toEqual({
      positives: 0,
      stars: 2,
      clicks: 0,
      deepReads: 0,
      negatives: 0
    });
    expect(mergePositiveSignals({ positives: 1, stars: 2 }, { positives: 2, stars: 3 })).toMatchObject({
      positives: 3,
      stars: 5
    });
  });

  it('detects stale islands and resolves taxonomy labels', () => {
    expect(isStaleIsland({})).toBe(true);
    expect(isStaleIsland({ lastBehaviorAt: new Date() })).toBe(false);
    expect(isStaleIsland({ updatedAt: new Date() })).toBe(true);
    expect(resolveTaxonomyDisplayName([], [{ displayName: 'AI', embedding_model: 'test-model', vector: [1, 0] }])).toBeNull();
    expect(resolveTaxonomyDisplayName([1, 0], [
      { displayName: 'Climate', embedding_model: 'test-model', vector: [0, 1] },
      { displayName: 'AI', embedding_model: 'test-model', vector: [1, 0] }
    ], 'test-model')).toBe('AI');
  });
  it('ignores incompatible taxonomy names even when their vectors are identical', () => {
    const rows = [
      { displayName: 'Wrong space', vector: [1, 0], embedding_model: 'other-model' },
      { displayName: 'Unknown space', vector: [1, 0], embedding_model: null },
      { displayName: 'Compatible', vector: [0.8, 0.2], embedding_model: 'test-model' }
    ];
    expect(resolveTaxonomyDisplayName([1, 0], rows, 'test-model')).toBe('Compatible');
    expect(resolveTaxonomyDisplayName([1, 0], rows, null)).toBeNull();
  });

  it('rejects the nearest taxonomy name when its similarity is too weak', () => {
    const name = (vector, rows) => resolveTaxonomyDisplayName(vector, rows, 'test-model');
    const row = { displayName: 'Boxing', vector: [0.28, 0.96], embedding_model: 'test-model' };
    expect(name([1, 0], [row])).toBeNull();
    expect(name([1, 0], [{ ...row, vector: [0.59, Math.sqrt(1 - 0.59 ** 2)] }])).toBeNull();
    expect(name([1, 0], [{ ...row, displayName: 'Concerts', vector: [0.6, 0.8] }])).toBe('Concerts');
    expect(name([0, 0], [row])).toBeNull();
    expect(name([1, 0], [{ ...row, vector: [1, 0, 0] }])).toBeNull();
    expect(name([1, 0], [{ ...row, displayName: ' ', vector: [1, 0] }, row])).toBeNull();
  });

});
