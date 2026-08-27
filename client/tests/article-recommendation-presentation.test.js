import { describe, expect, it } from 'vitest';
import { buildArticleRecommendationExplanation } from '../src/services/articleRecommendationPresentation.js';

describe('article recommendation presentation', () => {
  it('combines event coverage and source diversity into one readable reason', () => {
    const explanation = buildArticleRecommendationExplanation({
      score: 0.7591,
      reasons: [
        {
          code: 'event_coverage',
          articleCount: 4,
          event: { id: 3, name: 'Runtime launch' }
        },
        { code: 'source_diversity', sourceCount: 2 }
      ]
    });

    expect(explanation.items).toEqual([expect.objectContaining({
      code: 'event_coverage',
      title: 'Coverage and sources',
      text: 'Part of “Runtime launch”, covered by 4 articles from 2 sources.'
    })]);
    expect(explanation.scoreLabel).toBe('76% recommendation score');
  });

  it('uses safe fallback wording when optional names are unavailable', () => {
    const explanation = buildArticleRecommendationExplanation({
      score: 2,
      reasons: [
        { code: 'interest_match', value: 0.4 },
        { code: 'rule_match', tags: [] },
        { code: 'freshness', value: 0.1 },
        { code: 'quality', value: 0.5 }
      ]
    });

    expect(explanation.items.map(item => item.text)).toEqual([
      'Matches your learned interests.',
      'Matches one of your article rules.',
      'Freshness contributed to its ranking.',
      'Content quality contributed to its ranking.'
    ]);
    expect(explanation.scoreLabel).toBe('100% recommendation score');
  });

  it('handles missing recommendation details without rendering invalid values', () => {
    expect(buildArticleRecommendationExplanation(null)).toEqual({
      items: [],
      summary: 'These signals contributed to this article’s position.',
      scoreLabel: ''
    });
  });
});
