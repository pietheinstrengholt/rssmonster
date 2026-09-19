import { loadIslandEvidence } from '../islands/islandInterestConfidence.js';
import { explainArticleInterests } from '../score/scoreArticlesFromIslands.js';

// Owned by one read request: ranking, details and explanations use the same evidence clock.
export function createRequestPersonalization(userId, now = Date.now()) {
  let evidence;
  const results = new Map();
  return {
    now,
    assertUser(requestUserId) {
      if (String(requestUserId) !== String(userId)) {
        throw new TypeError('Personalization context belongs to another user');
      }
    },
    hasEvaluation(articleId) {
      return results.has(String(articleId));
    },
    async explain(articles) {
      evidence ??= loadIslandEvidence(userId, { now });
      const context = await evidence;
      const missing = articles.filter(article => !results.has(String(article.id)));
      if (missing.length) {
        const evaluation = await explainArticleInterests(userId, missing, { context });
        for (const [id, result] of evaluation.results) results.set(id, result);
      }
      return { context, results };
    }
  };
}
