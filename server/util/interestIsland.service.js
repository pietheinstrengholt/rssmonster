import db from '../models/index.js';
import { resolveArticleVector } from './vectorMath.js';
import { Op } from 'sequelize';
import {
  AFFINITY_HALF_LIFE_HOURS,
  ISLAND_PROMOTION_THRESHOLD,
  PROFILE_MATCH_THRESHOLD,
  INTERACTION_WEIGHTS,
  RECOMMENDATION_STEERING_WEIGHTS,
  ISLAND_VIABILITY_THRESHOLD
} from '../config/ranking.config.js';
import {
  invalidateCachedProfiles,
  loadInterestProfiles,
  scoreProfileMatch
} from './profileSelector.service.js';
import {
  invalidateCachedSuppressionSignals,
  loadSuppressionSignals
} from './suppressionScorer.service.js';
import { rankRecommendedArticles as orchRankRecommendedArticles } from './rankingOrchestrator.service.js';

const { Article, ArticleCluster, UserClusterAffinity, UserInterestProfile } = db;

/**
 * Interest Island Service - Main Write Path
 *
 * Responsibilities:
 * 1) Convert user interaction events into weighted reinforcement deltas.
 * 2) Persist per-cluster affinity and per-user semantic interest profiles.
 * 3) Orchestrate profile promotion and dashboard queries.
 *
 * Data model split:
 * - UserClusterAffinity: fast reinforcement signal tied to cluster ids.
 * - UserInterestProfile: semantic "islands" (vector + weight) used at ranking time.
 *
 * Dependencies:
 * - profileSelector.service.js: profile loading and matching
 * - suppressionScorer.service.js: suppression signal management
 * - rankingOrchestrator.service.js: ranking pipeline
 */

const nowUtc = () => new Date();

const hoursSince = (date) => {
  if (!date) return Infinity;
  const diffMs = nowUtc() - new Date(date).getTime();
  return diffMs / (1000 * 60 * 60);
};

const decayMultiplier = (date, halfLifeHours) => {
  const ageHours = hoursSince(date);
  if (!Number.isFinite(ageHours) || ageHours <= 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
};

export const blendVectors = (existingVector, incomingVector, existingWeight, incomingWeight) => {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) {
    return incomingVector;
  }

  if (existingVector.length !== incomingVector.length) {
    return incomingVector;
  }

  const totalWeight = Math.max(Number(existingWeight) + Number(incomingWeight), 0.0001);
  return existingVector.map((value, index) => (
    ((Number(value) || 0) * Number(existingWeight) + (Number(incomingVector[index]) || 0) * Number(incomingWeight)) / totalWeight
  ));
};

export const normalizeVector = (vector) => {
  if (!Array.isArray(vector)) return null;
  return vector.map(value => Number(value) || 0);
};

const resolveInterestVector = (article) => {
  const cluster = article?.get?.('cluster') ?? article?.cluster;
  return normalizeVector(
    cluster?.topicVector ??
    cluster?.eventVector ??
    article?.topicVector ??
    article?.eventVector ??
    resolveArticleVector(article)
  );
};

const resolveInterestTopicKey = (article) => {
  const cluster = article?.get?.('cluster') ?? article?.cluster;
  return cluster?.topicKey ?? null;
};

const deriveInteractionDelta = (article, changedFields = []) => {
  const changes = new Set(Array.isArray(changedFields) ? changedFields : []);
  let delta = 0;

  if (changes.has('starInd')) {
    delta += article.starInd === 1 ? INTERACTION_WEIGHTS.star : 0;
  }

  if (changes.has('clickedAmount') && Number(article.clickedAmount) > 0) {
    delta += Number(article.clickedAmount) * INTERACTION_WEIGHTS.click;
  }

  if (changes.has('negativeInd') && Number(article.negativeInd) === 1) {
    delta += INTERACTION_WEIGHTS.negative;
  }

  return delta;
};

async function loadArticleForInterestUpdate(article) {
  if (!article?.id) return null;

  if (article.cluster || article.get?.('cluster')) {
    return article;
  }

  return Article.scope('withVector').findByPk(article.id, {
    include: [
      {
        model: ArticleCluster,
        as: 'cluster',
        required: false,
        attributes: ['id', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
      }
    ]
  });
}

// Update one user<->cluster affinity row with temporal decay applied.
async function upsertClusterAffinity({ userId, clusterId, topicKey, delta, isStar = false, isClick = false }) {
  if (!userId || !clusterId || !Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const current = await UserClusterAffinity.findOne({
    where: { userId, clusterId }
  });

  const baseAffinity = current
    ? Number(current.affinity) || 0
    : 0;
  const decayedAffinity = current
    ? baseAffinity * decayMultiplier(current.lastInteractionAt, AFFINITY_HALF_LIFE_HOURS)
    : 0;

  const nextAffinity = decayedAffinity + delta;
  const payload = {
    userId,
    clusterId,
    topicKey,
    affinity: Number(nextAffinity.toFixed(4)),
    interactionCount: (Number(current?.interactionCount) || 0) + 1,
    starCount: (Number(current?.starCount) || 0) + (isStar ? 1 : 0),
    clickCount: (Number(current?.clickCount) || 0) + (isClick ? 1 : 0),
    lastInteractionAt: nowUtc()
  };

  if (current) {
    await current.update(payload);
    invalidateCachedSuppressionSignals(userId);
    return current;
  }

  const created = await UserClusterAffinity.create(payload);
  invalidateCachedSuppressionSignals(userId);
  return created;
}

// Promote cluster affinity to island if threshold is crossed.
// Finds or creates an island for the given cluster when accumulated affinity is hot enough.
async function promoteClusterAffinityToIsland({ userId, clusterId, affinity, starCount = 0, clickCount = 0 }) {
  if (!userId || !clusterId || !Number.isFinite(affinity) || affinity < ISLAND_PROMOTION_THRESHOLD) {
    return null;
  }

  // Load cluster with vectors for island initialization.
  const cluster = await ArticleCluster.findByPk(clusterId, {
    attributes: ['id', 'name', 'topicKey', 'topicVector', 'eventVector', 'articleCount']
  });

  if (!cluster) {
    return null;
  }

  const vector = normalizeVector(cluster.topicVector || cluster.eventVector);
  if (!Array.isArray(vector)) {
    return null;
  }

  // Check if an island already exists for this user + topicKey.
  const existing = await UserInterestProfile.findOne({
    where: {
      userId,
      topicKey: cluster.topicKey
    }
  });

  const label = cluster.name?.slice(0, 120) || null;
  const payload = {
    userId,
    label,
    topicKey: cluster.topicKey,
    vector,
    weight: Number(affinity.toFixed(4)),
    interactionCount: (Number(existing?.interactionCount) || 0) + 1,
    starCount: Math.max(Number(existing?.starCount) || 0, starCount),
    clickCount: Math.max(Number(existing?.clickCount) || 0, clickCount),
    lastSeen: nowUtc()
  };

  if (existing) {
    // Update existing island with new affinity and blended vector.
    const existingVector = normalizeVector(existing.vector);
    const existingWeight = Math.max(Number(existing.weight) || 0, 0.0001);
    const mergedVector = blendVectors(existingVector, vector, existingWeight, affinity);

    await existing.update({
      ...payload,
      vector: mergedVector
    });

    invalidateCachedProfiles(userId);
    return existing;
  }

  // Create new island.
  const created = await UserInterestProfile.create(payload);
  invalidateCachedProfiles(userId);
  return created;
}

// Reinforce nearest matching profile, or create a new profile if positive evidence is strong enough.
async function upsertInterestProfile({ userId, article, delta, isStar = false, isClick = false }) {
  if (!userId || !article || !Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const articleVector = resolveInterestVector(article);
  if (!Array.isArray(articleVector)) {
    return null;
  }

  const topicKey = resolveInterestTopicKey(article);
  const label = article?.cluster?.name || article?.title?.trim()?.slice(0, 120) || null;
  const profiles = await loadInterestProfiles(userId);
  const best = scoreProfileMatch(articleVector, topicKey, profiles);

  // Reinforce or weaken an existing island when semantic similarity is strong enough.
  if (best.profileId && best.affinityScore >= PROFILE_MATCH_THRESHOLD) {
    const current = await UserInterestProfile.findByPk(best.profileId);
    if (!current) return null;

    // Use stored (undecayed) weight for persistence, not the runtime effectiveWeight.
    // This prevents decay from compounding into permanent storage.
    const storedWeight = Math.max(Number(current.weight) || 0, 0);
    const nextWeight = Math.max(storedWeight + delta, 0);

    // Clean up dead islands: when weight drops below viability threshold, destroy the profile.
    // This prevents accumulation of semantic corpses with zero influence on rankings.
    if (nextWeight <= ISLAND_VIABILITY_THRESHOLD) {
      await current.destroy();
      invalidateCachedProfiles(userId);
      return null;
    }

    const existingVector = normalizeVector(current.vector);
    // Only blend vectors on positive reinforcement. Negative signals weaken weight
    // but do NOT reshape the island's semantic identity (avoid blending toward disliked content).
    const mergedVector = delta > 0
      ? blendVectors(existingVector, articleVector, storedWeight, Math.max(delta, 0.1))
      : existingVector;

    await current.update({
      label: current.label || label,
      topicKey: current.topicKey || topicKey,
      vector: mergedVector,
      weight: Number(nextWeight.toFixed(4)),
      interactionCount: (Number(current.interactionCount) || 0) + 1,
      starCount: (Number(current.starCount) || 0) + (isStar ? 1 : 0),
      clickCount: (Number(current.clickCount) || 0) + (isClick ? 1 : 0),
      // Only refresh recency on positive signals. Negative interactions weaken
      // the island but should not keep it artificially fresh (avoiding hate-reading effects).
      lastSeen: delta > 0 ? nowUtc() : current.lastSeen
    });

    invalidateCachedProfiles(userId);

    return current;
  }

  if (delta <= 0) {
    // Do not create new islands from neutral/negative-only evidence.
    return null;
  }

  const created = await UserInterestProfile.create({
    userId,
    label,
    topicKey,
    vector: articleVector,
    weight: Number(delta.toFixed(4)),
    interactionCount: 1,
    starCount: isStar ? 1 : 0,
    clickCount: isClick ? 1 : 0,
    lastSeen: nowUtc()
  });

  invalidateCachedProfiles(userId);
  return created;
}

/**
 * Main write path called from article model hooks.
 *
 * Flow:
 * - Ensure article + cluster/vector context is loaded.
 * - Convert changed fields into a weighted delta (star: 3, click: 1, negative: -2).
 * - Apply delta to cluster affinity (accumulates latent engagement).
 * - If cluster affinity >= ISLAND_PROMOTION_THRESHOLD, promote to interest island.
 */
export async function recordInterestFromArticleUpdate(article, changedFields = []) {
  const loadedArticle = await loadArticleForInterestUpdate(article);
  if (!loadedArticle) return null;

  const delta = deriveInteractionDelta(loadedArticle, changedFields);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const changes = new Set(Array.isArray(changedFields) ? changedFields : []);
  const isStar = changes.has('starInd') && Number(loadedArticle.starInd) === 1;
  const isClick = changes.has('clickedAmount') && Number(loadedArticle.clickedAmount) > 0;

  const cluster = loadedArticle.get?.('cluster') ?? loadedArticle.cluster;
  const clusterId = cluster?.id ?? loadedArticle.clusterId ?? null;
  const topicKey = cluster?.topicKey ?? null;

  // Update semantic profile even when clustering is unavailable.
  const profileUpdateRow = await upsertInterestProfile({ userId: loadedArticle.userId, article: loadedArticle, delta, isStar, isClick });

  let affinityRow = null;
  let profileRow = null;

  // Cluster affinity/promotion only applies when the article is attached to a cluster.
  if (clusterId) {
    affinityRow = await upsertClusterAffinity({
      userId: loadedArticle.userId,
      clusterId,
      topicKey,
      delta,
      isStar,
      isClick
    });

    // Check if cluster affinity crossed promotion threshold.
    if (affinityRow && Number(affinityRow.affinity) >= ISLAND_PROMOTION_THRESHOLD) {
      profileRow = await promoteClusterAffinityToIsland({
        userId: loadedArticle.userId,
        clusterId,
        affinity: Number(affinityRow.affinity),
        starCount: Number(affinityRow.starCount) || 0,
        clickCount: Number(affinityRow.clickCount) || 0
      });
    }
  }

  invalidateCachedSuppressionSignals(loadedArticle.userId);

  return {
    affinityRow,
    profileRow: profileRow || profileUpdateRow
  };
}

export async function applyRecommendationSteering({ article, action } = {}) {
  const loadedArticle = await loadArticleForInterestUpdate(article);
  if (!loadedArticle) return null;

  const steering = RECOMMENDATION_STEERING_WEIGHTS[action];
  if (!steering) return null;

  const cluster = loadedArticle.get?.('cluster') ?? loadedArticle.cluster;
  const clusterId = cluster?.id ?? loadedArticle.clusterId ?? null;
  if (!clusterId) return null;

  const topicKey = cluster?.topicKey ?? null;

  const affinityRow = await upsertClusterAffinity({
    userId: loadedArticle.userId,
    clusterId,
    topicKey,
    delta: steering.cluster
  });

  const profileRow = await upsertInterestProfile({
    userId: loadedArticle.userId,
    article: loadedArticle,
    delta: steering.profile
  });

  invalidateCachedSuppressionSignals(loadedArticle.userId);

  return {
    affinityRow,
    profileRow,
    action
  };
}

/**
 * Main read path for RECOMMENDED sort.
 *
 * Delegates to rankingOrchestrator service for scoring and ranking logic.
 */
export async function rankRecommendedArticles({ userId, articles = [] } = {}) {
  if (!userId || !Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const profiles = await loadInterestProfiles(userId);
  const suppressionSignals = await loadSuppressionSignals(userId);

  return orchRankRecommendedArticles({
    userId,
    articles,
    profiles,
    suppressionSignals
  });
}

// Placeholder hook for future profile refresh orchestration.
export async function refreshInterestProfilesForUser(userId) {
  if (!userId) return 0;

  const rows = await UserClusterAffinity.findAll({
    where: { userId },
    order: [['affinity', 'DESC'], ['lastInteractionAt', 'DESC']]
  });

  return rows.length;
}

export async function getInterestIslandDashboard(userId, { relatedArticleLimit = 5 } = {}) {
  if (!userId) {
    return {
      islands: [],
      totals: {
        totalArticles: 0,
        islandArticles: 0,
        nonIslandArticles: 0,
        islandCoveragePercent: 0,
        nonIslandCoveragePercent: 0,
        islandCount: 0
      }
    };
  }

  const profiles = await loadInterestProfiles(userId);
  const uniqueTopicKeys = Array.from(new Set(profiles.map(profile => profile.topicKey).filter(Boolean)));
  const totalArticles = await Article.count({ where: { userId } });

  if (!profiles.length) {
    return {
      islands: [],
      totals: {
        totalArticles,
        islandArticles: 0,
        nonIslandArticles: totalArticles,
        islandCoveragePercent: 0,
        nonIslandCoveragePercent: totalArticles > 0 ? 100 : 0,
        islandCount: 0
      }
    };
  }

  const profileSummaries = await Promise.all(
    profiles.map(async (profile) => {
      if (!profile.topicKey) {
        return {
          ...profile,
          relatedArticleCount: 0,
          relatedArticles: []
        };
      }

      const relatedArticleCount = await Article.count({
        where: { userId },
        include: [
          {
            model: ArticleCluster,
            as: 'cluster',
            required: true,
            attributes: [],
            where: { topicKey: profile.topicKey }
          }
        ]
      });

      const relatedArticles = await Article.findAll({
        where: { userId },
        include: [
          {
            model: ArticleCluster,
            as: 'cluster',
            required: true,
            attributes: ['id', 'name', 'topicKey', 'articleCount', 'sourceCount', 'clusterStrength', 'representativeArticleId'],
            where: { topicKey: profile.topicKey }
          },
          {
            model: db.Feed,
            attributes: ['id', 'feedName', 'url'],
            required: false
          }
        ],
        attributes: ['id', 'title', 'published', 'url', 'starInd', 'clickedAmount', 'status', 'feedId', 'clusterId'],
        order: [['published', 'DESC']],
        limit: relatedArticleLimit
      });

      return {
        ...profile,
        relatedArticleCount,
        relatedArticles: relatedArticles.map(article => ({
          id: article.id,
          title: article.title,
          url: article.url,
          published: article.published,
          starInd: Number(article.starInd) || 0,
          clickedAmount: Number(article.clickedAmount) || 0,
          status: article.status,
          feedName: article.feed?.feedName || null,
          feedUrl: article.feed?.url || null,
          cluster: {
            id: article.cluster?.id || null,
            name: article.cluster?.name || null,
            topicKey: article.cluster?.topicKey || null,
            articleCount: Number(article.cluster?.articleCount) || 0,
            sourceCount: Number(article.cluster?.sourceCount) || 0,
            clusterStrength: Number(article.cluster?.clusterStrength) || 0
          }
        }))
      };
    })
  );

  const islandArticles = uniqueTopicKeys.length
    ? await Article.count({
        where: { userId },
        include: [
          {
            model: ArticleCluster,
            as: 'cluster',
            required: true,
            attributes: [],
            where: { topicKey: { [Op.in]: uniqueTopicKeys } }
          }
        ]
      })
    : 0;

  const nonIslandArticles = Math.max(totalArticles - islandArticles, 0);

  return {
    islands: profileSummaries,
    totals: {
      totalArticles,
      islandArticles,
      nonIslandArticles,
      islandCoveragePercent: totalArticles > 0 ? Number(((islandArticles / totalArticles) * 100).toFixed(2)) : 0,
      nonIslandCoveragePercent: totalArticles > 0 ? Number(((nonIslandArticles / totalArticles) * 100).toFixed(2)) : 0,
      islandCount: profiles.length
    }
  };
}
