import {
  addPositiveSignals,
  blendIslandVector,
  buildPositiveSignalsAccumulator,
  isStaleIsland,
  mergePositiveSignals,
  normalizePositiveSignals,
  resolveTaxonomyDisplayName,
  resolveTopicFallbackLabel,
  sortIslandsByWeight,
  topicRecencyWeight
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

  it('keeps recency weights bounded and treats missing dates as current evidence', () => {
    expect(topicRecencyWeight(null)).toBe(1);
    expect(topicRecencyWeight(new Date(Date.now() + 86_400_000))).toBe(1);
    expect(topicRecencyWeight(new Date('2000-01-01T00:00:00.000Z'))).toBeGreaterThanOrEqual(0.2);
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

  it('detects stale islands and resolves taxonomy and topic labels', () => {
    expect(isStaleIsland({})).toBe(true);
    expect(isStaleIsland({ updatedAt: new Date() })).toBe(false);
    expect(resolveTaxonomyDisplayName([], [{ displayName: 'AI', vector: [1, 0] }])).toBeNull();
    expect(resolveTaxonomyDisplayName([1, 0], [
      { displayName: 'Climate', vector: [0, 1] },
      { displayName: 'AI', vector: [1, 0] }
    ])).toBe('AI');
    expect(resolveTopicFallbackLabel({ topics: [] })).toBeNull();
    expect(resolveTopicFallbackLabel({ topics: [{ topicId: 1, name: 'AI', strength: 0.8 }] })).toBe('AI');
    expect(resolveTopicFallbackLabel({ topics: [
      { topicId: 2, name: 'Linux', strength: 0.4 },
      { topicId: 1, name: 'AI', strength: 0.8 }
    ] })).toBe('AI / Linux');
  });
});
