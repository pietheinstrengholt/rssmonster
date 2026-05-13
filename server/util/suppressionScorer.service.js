/**
 * Suppression Scorer Service
 *
 * Responsibilities:
 * - Load suppression signals (cluster/topic penalties, feed penalties)
 * - Score suppression penalty for articles
 * - Manage suppression signal cache and invalidation
 */

import db from '../models/index.js';
import { Op, fn, col } from 'sequelize';
import {
  AFFINITY_HALF_LIFE_HOURS,
  SUPPRESSED_CLUSTER_AFFINITY_THRESHOLD,
  SUPPRESSED_FEED_MIN_NEGATIVE_COUNT,
  SUPPRESSION_FEED_NEGATIVE_DECAY_WEIGHT,
  TOPIC_SUPPRESSION_WEIGHT,
  FEED_SUPPRESSION_WEIGHT,
  MAX_SUPPRESSION_PENALTY,
  SUPPRESSION_CACHE_TTL_MS
} from '../config/ranking.config.js';

const { Article, UserClusterAffinity } = db;

// Cached suppression signals: userId -> { suppression, expiresAt }
const suppressionSignalCache = new Map();

const nowMs = () => Date.now();

const hoursSince = (date) => {
  if (!date) return Infinity;
  const diffMs = new Date() - new Date(date).getTime();
  return diffMs / (1000 * 60 * 60);
};

const decayMultiplier = (date, halfLifeHours) => {
  const ageHours = hoursSince(date);
  if (!Number.isFinite(ageHours) || ageHours <= 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
};

export const readCachedSuppressionSignals = (userId) => {
  const cached = suppressionSignalCache.get(userId);
  if (!cached) return null;

  if (cached.expiresAt <= nowMs()) {
    suppressionSignalCache.delete(userId);
    return null;
  }

  return cached.suppression;
};

export const writeCachedSuppressionSignals = (userId, suppression) => {
  suppressionSignalCache.set(userId, {
    suppression,
    expiresAt: nowMs() + SUPPRESSION_CACHE_TTL_MS
  });
};

export const invalidateCachedSuppressionSignals = (userId) => {
  if (!userId) return;
  suppressionSignalCache.delete(userId);
};

export async function loadSuppressionSignals(userId) {
  const cachedSuppression = readCachedSuppressionSignals(userId);
  if (cachedSuppression) {
    return cachedSuppression;
  }

  const [affinityRows, feedRows] = await Promise.all([
    UserClusterAffinity.findAll({
      where: {
        userId,
        affinity: { [Op.lte]: SUPPRESSED_CLUSTER_AFFINITY_THRESHOLD }
      },
      order: [['affinity', 'ASC'], ['lastInteractionAt', 'DESC']]
    }),
    Article.findAll({
      where: {
        userId,
        feedId: { [Op.ne]: null }
      },
      attributes: [
        'feedId',
        [fn('SUM', col('negativeInd')), 'negativeCount'],
        [fn('SUM', col('starInd')), 'starCount'],
        [fn('SUM', col('clickedAmount')), 'clickCount']
      ],
      group: ['feedId'],
      raw: true
    })
  ]);

  const clusterPenaltyById = new Map();
  const topicPenaltyByKey = new Map();

  for (const row of affinityRows) {
    const decayedNegativeAffinity = Math.abs(Number(row.affinity) || 0) * decayMultiplier(row.lastInteractionAt, AFFINITY_HALF_LIFE_HOURS);
    const penaltyStrength = clamp(1 - Math.exp(-decayedNegativeAffinity / 3), 0, 1);
    if (!penaltyStrength) continue;

    if (row.clusterId) {
      const existingClusterPenalty = Number(clusterPenaltyById.get(row.clusterId)) || 0;
      clusterPenaltyById.set(row.clusterId, Math.max(existingClusterPenalty, penaltyStrength));
    }

    if (row.topicKey) {
      const existingTopicPenalty = Number(topicPenaltyByKey.get(row.topicKey)) || 0;
      topicPenaltyByKey.set(row.topicKey, Math.max(existingTopicPenalty, penaltyStrength));
    }
  }

  const feedPenaltyById = new Map();

  for (const row of feedRows) {
    const feedId = Number(row.feedId);
    if (!Number.isFinite(feedId)) continue;

    const negativeCount = Number(row.negativeCount) || 0;
    if (negativeCount < SUPPRESSED_FEED_MIN_NEGATIVE_COUNT) continue;

    const starCount = Number(row.starCount) || 0;
    const clickCount = Number(row.clickCount) || 0;
    const positiveOffset = starCount * 2 + Math.min(clickCount, 20) * SUPPRESSION_FEED_NEGATIVE_DECAY_WEIGHT;
    const netNegative = negativeCount - positiveOffset;
    if (netNegative <= 0) continue;

    const penaltyStrength = clamp(1 - Math.exp(-netNegative / 4), 0, 1);
    feedPenaltyById.set(feedId, penaltyStrength);
  }

  const suppression = {
    clusterPenaltyById,
    topicPenaltyByKey,
    feedPenaltyById
  };

  writeCachedSuppressionSignals(userId, suppression);
  return suppression;
}

export function scoreSuppressionPenalty(article, suppressionSignals) {
  const cluster = article?.get?.('cluster') ?? article?.cluster;
  const clusterId = cluster?.id ?? article?.clusterId ?? null;
  const topicKey = cluster?.topicKey ?? null;
  const feedId = article?.feedId ?? null;

  const clusterPenaltyById = Number(clusterId ? suppressionSignals?.clusterPenaltyById?.get(clusterId) : 0) || 0;
  const clusterPenaltyByTopic = Number(topicKey ? suppressionSignals?.topicPenaltyByKey?.get(topicKey) : 0) || 0;
  const topicPenalty = Math.max(clusterPenaltyById, clusterPenaltyByTopic);
  const topicSource = clusterPenaltyById >= clusterPenaltyByTopic ? 'cluster' : 'topicKey';
  const feedPenalty = Number(feedId ? suppressionSignals?.feedPenaltyById?.get(feedId) : 0) || 0;

  const penalty = clamp(
    topicPenalty * TOPIC_SUPPRESSION_WEIGHT +
    feedPenalty * FEED_SUPPRESSION_WEIGHT,
    0,
    MAX_SUPPRESSION_PENALTY
  );

  const reasons = [];
  const sources = [];

  if (topicPenalty > 0) {
    sources.push('topic');
    reasons.push(topicSource === 'cluster'
      ? `Suppressed by negative cluster affinity for cluster ${clusterId}`
      : `Suppressed by negative topic affinity for topic ${topicKey}`);
  }

  if (feedPenalty > 0) {
    sources.push('feed');
    reasons.push(`Suppressed by negative feed interactions for feed ${feedId}`);
  }

  return {
    penalty,
    source: sources.length ? sources.join('+') : 'none',
    reason: reasons.length ? reasons.join('; ') : 'No suppression signals',
    components: {
      topicPenalty,
      topicSource,
      clusterId,
      topicKey,
      feedPenalty,
      feedId
    }
  };
}
