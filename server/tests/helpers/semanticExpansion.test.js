import { describe, expect, it } from 'vitest';
import { expansionFixture, loadExpansionVectors, scenarioArticles, expansionMetrics, requiredBehavioralTransfers } from './semanticExpansion.js';

describe('semantic expansion fixture contracts', () => {
  it('accounts for purposeful unique Articles, valid feeds, dates, and isolated waves', () => {
    const { scenarios, articles, feeds } = expansionFixture;
    expect(articles).toHaveLength(226);
    expect(new Set(articles.map(a => a.sourceId)).size).toBe(226);
    expect(new Set(articles.map(a => a.url)).size).toBe(226);
    expect(new Set(scenarios.map(s => s.id)).size).toBe(scenarios.length);
    for (const article of articles) {
      expect(feeds.some(f => f.id === article.feedId)).toBe(true);
      expect(scenarios.some(s => s.id === article.regression.scenario && s.expected)).toBe(true);
      expect(Number.isFinite(Date.parse(article.publishedAt))).toBe(true);
      expect(article.title.length).toBeGreaterThan(10);
      expect(article.description.length).toBeGreaterThan(40);
    }
    const held = articles.filter(a => a.regression.role === 'held-out');
    expect(held).toHaveLength(40);
    expect(articles.filter(a => a.regression.role === 'training')).toHaveLength(24);
    expect(held.every(a => !a.favoriteInd && !a.negativeInd && !a.positiveInd && !a.clickedAmount)).toBe(true);
    for (const scenario of scenarios.filter(s => s.kind === 'behavior')) {
      const rows = scenarioArticles(scenario);
      const training = rows.filter(a => a.regression.role === 'training');
      expect(rows.filter(a => a.regression.role === 'held-out').every(a => a.regression.wave > Math.max(...training.map(s => s.regression.wave)))).toBe(true);
    }
    expect(new Set(articles.map(a => a.language))).toEqual(new Set(['en', 'nl', 'de', 'fr']));
    expect(articles.some(a => !('contentOriginal' in a))).toBe(true);
    expect(articles.some(a => (a.contentOriginal || '').length > 1800)).toBe(true);
  });

  it('never silently removes required fallback probes when their source becomes assigned', () => {
    const source = { id: 1, regression: { role: 'training', interestGroup: 7 } };
    const article = { id: 2, regression: { role: 'held-out', interestGroup: 7, expectedEvidence: 'unassigned-behavior' } };
    const result = { rows: [source, article], evidence: { fallbackEvidence: [] } };
    expect(requiredBehavioralTransfers(result)).toEqual([{ article, source, unassigned: false }]);
    result.evidence.fallbackEvidence = [source];
    expect(requiredBehavioralTransfers(result)).toEqual([{ article, source, unassigned: true }]);
    expect(expansionFixture.articles.filter(a => a.regression.expectedEvidence === 'unassigned-behavior')).toHaveLength(21);
  });

  it('loads complete frozen vectors bound to the actual embedding inputs', async () => {
    const { vectors, metadata } = await loadExpansionVectors();
    expect(vectors.size).toBe(226);
    expect(metadata).toMatchObject({ embeddingModel: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', embeddingDimensions: 1024 });
  });

  it('separates raw corpus count from canonical Recommended coverage', () => {
    const metrics = expansionMetrics([{ rows: [
      { interestScore: 0, recommended: 0.3, recommendedEligible: true, regression: { role: 'held-out' } },
      { interestScore: 0, recommended: 0.3, recommendedEligible: false, regression: { role: 'incoming' } }
    ] }]);
    expect(metrics['Expansion articles']).toBe(2);
    expect(metrics['Articles eligible for Recommended']).toBe(1);
    expect(metrics['Recommended coverage (%)']).toBe(100);
    expect(metrics['Explicit held-out articles']).toBe(1);
  });
});
