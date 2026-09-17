import { articleRecords } from '../articles/articleRecords.js';
import { col, fn, literal, Op } from 'sequelize';
import { computeRecommended } from '../recommendations/recommendedScore.js';

const value = (article, key) => article.get?.(key) ?? article[key];
const summarize = articles => ({
  articles: articles.length,
  recordedInterestEvaluations: articles.filter(a => value(a, 'interestScoredAt') != null).length,
  nonzeroInterest: articles.filter(a => Number(value(a, 'interestScore')) !== 0 && Number.isFinite(Number(value(a, 'interestScore')))).length
});

// Opt-in diagnostic counts reuse the actual predicates; never reimplement view eligibility.
// Counts are observations, not a transaction snapshot or proof of browser impressions.
export function createRecommendationFunnel(metadata) {
  const queries = [];
  const runtime = [];
  let previousArticles = null;
  return {
    captureQuery(stage, where) {
      queries.push({ stage, where: { ...where, ...(where[Op.and] ? { [Op.and]: [...where[Op.and]] } : {}) } });
    },
    captureArticles(stage, articles) {
      const ids = new Set(articles.map(a => String(value(a, 'id'))));
      const excluded = previousArticles?.filter(a => !ids.has(String(value(a, 'id')))) || [];
      const row = { stage, ...summarize(articles), excludedFromPrevious: excluded.length,
        excludedArticleIdSample: excluded.slice(0, 20).map(a => value(a, 'id')) };
      if (stage === 'recommended_scored') {
        const scores = articles.map(computeRecommended);
        row.finiteRecommended = scores.filter(Number.isFinite).length;
        row.recommended = { minimum: scores.length ? scores.reduce((a, b) => Math.min(a, b)) : null,
          maximum: scores.length ? scores.reduce((a, b) => Math.max(a, b)) : null,
          zero: scores.filter(score => score === 0).length };
      }
      runtime.push(row);
      previousArticles = articles;
    },
    async finish() {
      const stages = [];
      // Sequential counts avoid flooding the connection pool for a diagnostic request.
      for (const { stage, where } of queries) {
        const [row] = await articleRecords.findAll({ where, raw: true, attributes: [
          [fn('COUNT', col('id')), 'articles'],
          [fn('SUM', literal('CASE WHEN interestScoredAt IS NOT NULL THEN 1 ELSE 0 END')), 'recordedInterestEvaluations'],
          [fn('SUM', literal('CASE WHEN interestScore <> 0 THEN 1 ELSE 0 END')), 'nonzeroInterest']
        ] });
        const counts = Object.fromEntries(['articles', 'recordedInterestEvaluations', 'nonzeroInterest'].map(key => [key, Number(row?.[key] || 0)]));
        const previous = stages.at(-1);
        stages.push({ stage, ...counts,
          excludedFromPrevious: previous ? previous.articles - counts.articles : 0,
          recordedEvaluationsExcluded: previous ? previous.recordedInterestEvaluations - counts.recordedInterestEvaluations : 0 });
      }
      if (runtime.length && stages.length) runtime[0].excludedFromPrevious = stages.at(-1).articles - runtime[0].articles;
      return { ...metadata, observedAt: new Date().toISOString(), databaseStages: stages, runtimeStages: runtime,
        displayMeaning: 'Selected IDs, not browser impressions. SQL counts may change during concurrent writes.', sampleLimit: 20 };
    }
  };
}
