import {
  averageVector,
  blendVector,
  cosineSimilarity,
  hasUsableVector,
  normalizeVector,
  parseVector,
  weightedAverageVector
} from '../services/vectors/index.js';

describe('vector services', () => {
  it('handles null and empty vectors', () => {
    expect(parseVector(null)).toBeNull();
    expect(hasUsableVector(null)).toBe(false);
    expect(hasUsableVector([])).toBe(false);
    expect(normalizeVector(null)).toBeNull();
    expect(normalizeVector([])).toBeNull();
    expect(averageVector([null, []])).toBeNull();
    expect(weightedAverageVector([{ vector: null, weight: 1 }])).toBeNull();
    expect(cosineSimilarity(null, [1, 0])).toBe(0);
  });

  it('returns zero similarity for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('skips mismatched dimensions in averages', () => {
    expect(averageVector([[2, 4], [10]])).toEqual([2, 4]);
    expect(weightedAverageVector([
      { vector: [3, 4], weight: 1 },
      { vector: [10], weight: 100 }
    ])).toEqual([0.6, 0.8]);
  });

  it('parses JSON string vectors without making similarity parse strings by default', () => {
    expect(parseVector('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseVector('{"x":1}')).toBeNull();
    expect(cosineSimilarity('[1,0]', '[1,0]')).toBe(0);
    expect(cosineSimilarity('[1,0]', '[1,0]', { parseStrings: true })).toBe(1);
  });

  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1);
  });

  it('computes raw averages without normalization', () => {
    expect(averageVector([[3, 4], [0, 0]])).toEqual([1.5, 2]);
  });

  it('computes normalized weighted averages', () => {
    const vector = weightedAverageVector([
      { vector: [1, 0], weight: 1 },
      { vector: [0, 2], weight: 3 }
    ]);

    expect(vector[0]).toBeCloseTo(1 / Math.sqrt(37));
    expect(vector[1]).toBeCloseTo(6 / Math.sqrt(37));
  });

  it('blends vectors by alpha without normalization', () => {
    expect(blendVector([0, 0], [4, 8], 0.25)).toEqual([1, 2]);
    expect(blendVector([0, 0], [4, 8], -1)).toEqual([0, 0]);
    expect(blendVector([0, 0], [4, 8], 2)).toEqual([4, 8]);
  });
});
