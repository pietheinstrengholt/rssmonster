import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../../services/duplicates/articleDuplicates.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';
import { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { recommendationCoverage } from '../helpers/semanticRecommendationDiagnostics.js';
import { resolveSemanticVectorFixturePath, semanticVectorFixtureExists } from '../../utils/semanticVectorFixtures.js';

const suite = await semanticVectorFixtureExists(await resolveSemanticVectorFixturePath('semantic-regression')) ? describe : describe.skip;
suite('semantic Recommended coverage', () => {
  it('scores every eligible article, keeping unmatched interest neutral and negative interest penalized', async () => {
    const user = await db.User.findOne({ where: { username: 'semantic-regression-user' } });
    expect(user).toBeTruthy();
    const articles = await db.Article.findAll({ where: { userId: user.id, ...canonicalArticleWhere(), filteredInd: false },
      include: [{ model: db.Event, as: 'event', required: false }, { model: db.Feed, required: false }] });
    const { results } = await explainArticleInterests(user.id, articles);
    let unmatched = 0;
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      expect(Number.isFinite(computeRecommended(article)), article.title).toBe(true);
      if (article.status === 'unread' && results.get(String(article.id)).paths.length === 0) {
        expect(article.interestScore, article.title).toBe(0);
        unmatched++;
      }
      const neutral = { ...article.get({ plain: true }), interestScore: 0 };
      const withoutInterest = computeRecommended(neutral);
      if (article.interestScore < 0) expect(computeRecommended(article)).toBeLessThanOrEqual(withoutInterest);
      if (article.interestScore > 0) expect(computeRecommended(article)).toBeGreaterThanOrEqual(withoutInterest);
      if (!article.eventId) expect(computeRecommendedBreakdown(article).corroboration).toBe(0);
    }
    expect(unmatched).toBeGreaterThan(0);
    expect(articles.some(article => article.interestScore > 0)).toBe(true);
    expect(articles.some(article => !article.topicId && !article.eventId && article.interestScore === 0)).toBe(true);
    const coverage = recommendationCoverage(articles.map(article => ({ recommended: computeRecommended(article), interestScore: article.interestScore })));
    expect(coverage['Articles with Recommended score']).toBe(articles.length);
    expect(coverage['Recommended coverage (%)']).toBe(100);
    console.table(coverage);
  });
});
