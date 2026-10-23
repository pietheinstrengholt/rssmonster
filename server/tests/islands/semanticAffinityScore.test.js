import { describe, expect, it, vi } from 'vitest';
import { evaluateArticleInterest, prepareIslandEvidence } from '../../services/islands/islandInterestConfidence.js';

const model = 'affinity-test';
const article = { id: 100, articleVector: [1, 0, 0], embedding_model: model };
const island = (id, cosine, weight = 1) => ({ id, weight, embedding_model: model,
  islandVector: [cosine, Math.sqrt(1 - cosine ** 2), 0] });
const context = islands => ({ ...prepareIslandEvidence(islands, []), now: Date.parse('2026-10-18T09:00:00Z') });

describe('strongest threshold-free semantic affinity', () => {
  it('gives single-Island users quadratic affinity below the interest threshold without inference', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected inference'));
    try {
      const result = evaluateArticleInterest(article, context([island(1, 0.5)]));
      expect(result.semanticAffinityScore).toBe(0.025);
      expect(result.score).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it('uses the strongest weighted confidence even with overlapping Islands and deterministic ties', () => {
    const evidence = context([island(10, 0.8), island(2, 0.8), island(3, 0.6)]);
    Object.assign(evidence.islands[0], { preferenceStrength: 0.5, islandConfidence: 0.8 });
    Object.assign(evidence.islands[1], { preferenceStrength: 0.5, islandConfidence: 0.8 });
    Object.assign(evidence.islands[2], { preferenceStrength: 1, islandConfidence: 0.5 });
    const result = evaluateArticleInterest(article, evidence);
    expect(result.semanticAffinityScore).toBe(0.256);
    expect(evaluateArticleInterest(article, { ...evidence, islands: evidence.islands.toReversed() })).toEqual(result);
    expect(evaluateArticleInterest(article, evidence, 1).semanticAffinityScore).toBe(0.256);
    expect(result.score).toBe(0.1895);
  });

  it.each([[0.1, 0.001], [0.01, 0], [0, 0], [-0.5, 0], [1, 0.1]])('rounds cosine %s to affinity %s', (cosine, expected) => {
    const result = evaluateArticleInterest(article, context([island(1, cosine)]));
    expect(result.semanticAffinityScore).toBe(expected);
    expect(result.semanticAffinityScore).toBeGreaterThanOrEqual(0);
    expect(result.semanticAffinityScore).toBeLessThanOrEqual(1);
  });

  it('keeps negative preference and behavioral fallback out of affinity', () => {
    const evidence = context([island(1, 1, -1), island(2, 1, 0)]);
    evidence.fallbackEvidence = [{ ...article, savedInd: 1, savedAt: new Date(evidence.now) }];
    const result = evaluateArticleInterest(article, evidence);
    expect(result.semanticAffinityScore).toBe(0);
    expect(result.score).toBe(0.075);
  });

  it.each([null, [], [1, 0], [NaN, 0, 0]])('returns finite zero for unsupported vector %j', articleVector => {
    expect(evaluateArticleInterest({ ...article, articleVector }, context([island(1, 1)])).semanticAffinityScore).toBe(0);
  });

  it('handles empty profiles and incompatible embeddings without artificial affinity', () => {
    for (const embedding_model of [null, 'incompatible']) {
      expect(evaluateArticleInterest({ ...article, embedding_model }, context([island(1, 1)])).semanticAffinityScore).toBe(0);
    }
    expect(evaluateArticleInterest(article, context([])).semanticAffinityScore).toBe(0);
    const evidence = context([island(1, 0.5)]);
    evidence.islands[0].islandConfidence = NaN;
    expect(evaluateArticleInterest(article, evidence).semanticAffinityScore).toBe(0);
  });
});
