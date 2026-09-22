import db from '../../models/index.js';
import { getEventSimilarityThreshold } from '../config/semanticConfig.js';

const { Feed, Category } = db;

// Preload the preference without adding a query per Article in assignment batches.
export const eventClusteringFeedInclude = {
  model: Feed,
  attributes: ['userId', 'generateEmbeddings'],
  required: false,
  include: [{ model: Category, attributes: ['userId', 'clusteringBehavior'], required: false }]
};

export async function articleEventSimilarityThreshold(article) {
  // Standalone callers may supply an Article without its feed association.
  const feed = article.feed === null || article.feed?.category !== undefined ? article.feed : await Feed.findOne({
    where: { id: article.feedId, userId: article.userId },
    attributes: ['userId'],
    include: eventClusteringFeedInclude.include
  });
  const category = feed?.category;
  const behavior = Number(feed?.userId) === Number(article.userId) &&
    Number(category?.userId) === Number(article.userId) ? category.clusteringBehavior : null;
  return getEventSimilarityThreshold(behavior);
}
