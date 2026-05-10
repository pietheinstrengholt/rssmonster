import db from '../models/index.js';
const { Article } = db;
import { Op, fn, col } from 'sequelize';
import {
  averageVectors,
  cosineSimilarity,
  resolveArticleVector
} from './vectorMath.js';

const MAX_INTEREST_ARTICLES = 20;
const UPDATE_CONCURRENCY = 20;

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const chunkResults = await Promise.all(chunk.map(mapper));
    results.push(...chunkResults);
  }
  return results;
};

async function loadUserInterestVector(userId) {
  const interestArticles = await Article.scope('withVector').findAll({
    where: {
      userId,
      starInd: 1
    },
    attributes: ['topicVector', 'eventVector'],
    order: [['updatedAt', 'DESC']],
    limit: MAX_INTEREST_ARTICLES
  });

  return averageVectors(
    interestArticles
      .map(resolveArticleVector)
      .filter(Boolean)
  );
}

const clampScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
};

export async function refreshSimilarityCacheForUser(userId, { articleIds = null, onlyStarred = false } = {}) {
  if (!userId) return new Map();

  const userVector = await loadUserInterestVector(userId);

  const where = { userId };
  if (Array.isArray(articleIds) && articleIds.length > 0) {
    where.id = { [Op.in]: articleIds };
  } else if (onlyStarred) {
    where.starInd = 1;
  }

  const articles = await Article.scope('withVector').findAll({
    where,
    attributes: ['id', 'eventVector']
  });

  const similarityRows = articles.map(article => {
    const articleVector = resolveArticleVector(article);
    const score = Array.isArray(userVector) && Array.isArray(articleVector)
      ? cosineSimilarity(userVector, articleVector)
      : 0;

    return {
      id: article.id,
      similarityScore: clampScore(score)
    };
  });

  await mapWithConcurrency(similarityRows, UPDATE_CONCURRENCY, ({ id, similarityScore }) => (
    Article.update(
      { similarityScore },
      { where: { id, userId } }
    )
  ));

  return new Map(similarityRows.map(row => [row.id, row.similarityScore]));
}

export async function refreshSimilarityCacheForAllUsers({ onlyStarred = true } = {}) {
  const rows = await Article.findAll({
    attributes: [[fn('DISTINCT', col('userId')), 'userId']],
    raw: true
  });

  const userIds = rows
    .map(row => Number(row.userId))
    .filter(Number.isFinite);

  const mode = onlyStarred ? 'starred articles only' : 'all articles';
  console.log(`\x1b[36mRefreshing similarity cache for ${userIds.length} users (${mode})...\x1b[0m`);

  for (let idx = 0; idx < userIds.length; idx++) {
    const userId = userIds[idx];
    const articlesUpdated = await refreshSimilarityCacheForUser(userId, { onlyStarred });
    const progress = ((idx + 1) / userIds.length * 100).toFixed(1);
    console.log(`\x1b[32m[${progress}%] User ${userId}: ${articlesUpdated.size} articles cached\x1b[0m`);
  }

  console.log(`\x1b[36mSimilarity cache refresh complete for ${userIds.length} users\x1b[0m`);
  return userIds.length;
}
