import { averageVector } from '../vectors/index.js';
import { eventWindowFromArticles } from './articleEventTime.js';

// This function deterministically derives event metadata from persisted canonical member articles.
export function buildCanonicalEventProjection(eventArticles = [], fallbackVector = null) {
  const orderedArticles = eventArticles
    .slice()
    .sort((left, right) => Number(left.id) - Number(right.id));
  const vectors = orderedArticles
    .map(article => article.articleVector)
    .filter(vector => Array.isArray(vector) && vector.length);
  const eventVector = averageVector(vectors) ?? fallbackVector ?? null;
  const { eventWindowStartAt, eventWindowEndAt } = eventWindowFromArticles(orderedArticles);
  const sourceCount = new Set(
    orderedArticles
      .map(article => article.feedId)
      .filter(feedId => feedId != null)
  ).size;

  return {
    articleCount: orderedArticles.length,
    eventVector,
    eventWindowStartAt,
    eventWindowEndAt,
    sourceCount,
    sourceDiversityScore: Math.log(sourceCount + 1)
  };
}

export default buildCanonicalEventProjection;
