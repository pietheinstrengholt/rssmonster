import { latestBehaviorTimestamp } from '../articles/articleBehaviorTime.js';
import { embeddingSimilarity } from '../vectors/embeddingModel.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD } from './islandVectorUtils.js';

export const ISLAND_SUPPORT_LIMIT = 64;

// IDs are retrieval hints, never membership or behavioral evidence in their own right.
export function islandSupportArticleIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string' || Number.isSafeInteger(id))
    .map(String).filter(id => /^[1-9]\d{0,19}$/.test(id)))].slice(0, ISLAND_SUPPORT_LIMIT);
}

export function isCurrentIslandSupport(article, island, now = Date.now()) {
  return String(article.userId) === String(island.userId)
    && !article.filteredInd && article.duplicateOfArticleId == null
    && latestBehaviorTimestamp(article, undefined, now) != null
    && embeddingSimilarity(article.articleVector, island.islandVector, article.embedding_model, island.embedding_model,
      { parseStrings: true, coerceNumbers: true }) >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD;
}

// Keep a deterministic, bounded snapshot of the calibration's current support.
export function selectIslandSupportArticleIds(articles, island, now = Date.now()) {
  const eligible = articles.filter(article => isCurrentIslandSupport(article, island, now));
  eligible.sort((a, b) => Number(latestBehaviorTimestamp(b, undefined, now)) - Number(latestBehaviorTimestamp(a, undefined, now))
    || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  return islandSupportArticleIds(eligible.map(article => article.id));
}
