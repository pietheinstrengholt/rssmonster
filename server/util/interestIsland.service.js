import db from '../models/index.js';
import { cosineSimilarity, resolveArticleVector } from './vectorMath.js';
import { computeRecommended } from './recommendedScore.js';
import { Op, fn, col } from 'sequelize';

const { Article, ArticleCluster, UserClusterAffinity, UserInterestProfile } = db;

/**
 * Interest island service
 *
 * Responsibilities:
 * 1) Convert user interaction events into weighted reinforcement deltas.
 * 2) Persist per-cluster affinity and per-user semantic interest profiles.
 * 3) Rank candidate articles for RECOMMENDED sort using island affinity + recommendedScore baseline.
 *
 * Data model split:
 * - UserClusterAffinity: fast reinforcement signal tied to cluster ids.
 * - UserInterestProfile: semantic "islands" (vector + weight) used at ranking time.
 */

const AFFINITY_HALF_LIFE_HOURS = 168;
const PROFILE_HALF_LIFE_HOURS = 336;
// Keep ranking focused on a small active set for predictable latency.
const MAX_ACTIVE_PROFILES = 5;
const ACTIVE_PROFILE_DIVERSITY_SIMILARITY_THRESHOLD = Math.max(
  0,
  Math.min(Number(process.env.INTEREST_ISLAND_PROFILE_SIMILARITY_THRESHOLD) || 0.88, 0.999)
);
const ACTIVE_PROFILE_CANDIDATE_LIMIT = Math.max(
  MAX_ACTIVE_PROFILES,
  Number(process.env.INTEREST_ISLAND_PROFILE_CANDIDATE_LIMIT) || (MAX_ACTIVE_PROFILES * 8)
);
const PROFILE_MATCH_THRESHOLD = 0.72;
// Ranking-only gate: require a minimum confidence before we attach an island match.
// This prevents weak semantic overlap from labeling almost every article with an island.
const RANKING_AFFINITY_THRESHOLD = 0.18;
const SUPPRESSED_CLUSTER_AFFINITY_THRESHOLD = -1.5;
const SUPPRESSED_FEED_MIN_NEGATIVE_COUNT = 2;
const SUPPRESSION_FEED_NEGATIVE_DECAY_WEIGHT = 0.15;
const TOPIC_SUPPRESSION_WEIGHT = 0.7;
const FEED_SUPPRESSION_WEIGHT = 0.3;
const MAX_SUPPRESSION_PENALTY = 0.9;
const MIN_ISLAND_ATTACH_RATIO = 0.10;
const TARGET_ISLAND_ATTACH_RATIO = 0.15;
const MAX_ISLAND_ATTACH_RATIO = 0.20;
// Cluster affinity threshold for promotion to interest island.
// ~5 clicks or 1 star + 2 clicks = enough evidence to carve out an island.
const ISLAND_PROMOTION_THRESHOLD = 5;
// Short-lived in-memory cache to avoid repeated profile reads on hot requests.
const PROFILE_CACHE_TTL_MS = 30_000;
const SUPPRESSION_CACHE_TTL_MS = 30_000;

// Interaction deltas used to reinforce (or penalize) interest islands.
const INTERACTION_WEIGHTS = {
  star: 3,
  click: 1,
  negative: -2
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// userId -> { profiles, expiresAt }
const interestProfileCache = new Map();
// userId -> { suppression, expiresAt }
const suppressionSignalCache = new Map();

const nowUtc = () => new Date();

const nowMs = () => Date.now();

const readCachedProfiles = (userId) => {
  const cached = interestProfileCache.get(userId);
  if (!cached) return null;

  if (cached.expiresAt <= nowMs()) {
    interestProfileCache.delete(userId);
    return null;
  }

  return cached.profiles;
};

const writeCachedProfiles = (userId, profiles) => {
  interestProfileCache.set(userId, {
    profiles,
    expiresAt: nowMs() + PROFILE_CACHE_TTL_MS
  });
};

const invalidateCachedProfiles = (userId) => {
  if (!userId) return;
  interestProfileCache.delete(userId);
};

const readCachedSuppressionSignals = (userId) => {
  const cached = suppressionSignalCache.get(userId);
  if (!cached) return null;

  if (cached.expiresAt <= nowMs()) {
    suppressionSignalCache.delete(userId);
    return null;
  }

  return cached.suppression;
};

const writeCachedSuppressionSignals = (userId, suppression) => {
  suppressionSignalCache.set(userId, {
    suppression,
    expiresAt: nowMs() + SUPPRESSION_CACHE_TTL_MS
  });
};

const invalidateCachedSuppressionSignals = (userId) => {
  if (!userId) return;
  suppressionSignalCache.delete(userId);
};

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

const blendVectors = (existingVector, incomingVector, existingWeight, incomingWeight) => {
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

const normalizeVector = (vector) => {
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

function selectDiverseProfiles(profiles, {
  maxProfiles = MAX_ACTIVE_PROFILES,
  similarityThreshold = ACTIVE_PROFILE_DIVERSITY_SIMILARITY_THRESHOLD
} = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0 || maxProfiles <= 0) {
    return [];
  }

  const selectedProfiles = [];

  for (const profile of profiles) {
    const tooSimilar = selectedProfiles.some(existing => {
      if (!Array.isArray(profile.vector) || !Array.isArray(existing.vector)) {
        return false;
      }

      const similarity = cosineSimilarity(profile.vector, existing.vector);
      return Number.isFinite(similarity) && similarity > similarityThreshold;
    });

    if (tooSimilar) {
      continue;
    }

    selectedProfiles.push(profile);

    if (selectedProfiles.length >= maxProfiles) {
      break;
    }
  }

  return selectedProfiles;
}

async function loadSuppressionSignals(userId) {
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

function scoreSuppressionPenalty(article, suppressionSignals) {
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

// Load top active profiles for a user (cached), then compute recency-adjusted weight.
async function loadInterestProfiles(userId) {
  // Read-through cache: DB only on miss/expiry.
  const cachedProfiles = readCachedProfiles(userId);
  if (cachedProfiles) {
    return cachedProfiles.map(profile => ({
      ...profile,
      effectiveWeight: (Number(profile.weight) || 0) * decayMultiplier(profile.lastSeen, PROFILE_HALF_LIFE_HOURS)
    }));
  }

  const rows = await UserInterestProfile.findAll({
    where: { userId },
    order: [['weight', 'DESC'], ['lastSeen', 'DESC']],
    // Pull a wider candidate set, then diversify into active profiles.
    limit: ACTIVE_PROFILE_CANDIDATE_LIMIT
  });

  const candidateProfiles = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      label: row.label,
      topicKey: row.topicKey,
      vector: normalizeVector(row.vector),
      weight: Number(row.weight) || 0,
      interactionCount: Number(row.interactionCount) || 0,
      starCount: Number(row.starCount) || 0,
      clickCount: Number(row.clickCount) || 0,
      lastSeen: row.lastSeen
    }));

  const profiles = selectDiverseProfiles(candidateProfiles, {
    maxProfiles: MAX_ACTIVE_PROFILES,
    similarityThreshold: ACTIVE_PROFILE_DIVERSITY_SIMILARITY_THRESHOLD
  });

  writeCachedProfiles(userId, profiles);

  return profiles.map(profile => ({
    ...profile,
    effectiveWeight: (Number(profile.weight) || 0) * decayMultiplier(profile.lastSeen, PROFILE_HALF_LIFE_HOURS)
  }));
}

// Find best matching profile for an article vector and optional topic key.
function scoreProfileMatch(articleVector, topicKey, profiles) {
  if (!Array.isArray(articleVector) || !profiles.length) {
    return { affinityScore: 0, profileId: null, profileLabel: null };
  }

  let best = { affinityScore: 0, profileId: null, profileLabel: null, effectiveWeight: 0 };

  for (const profile of profiles) {
    if (!Array.isArray(profile.vector)) continue;

    const similarity = cosineSimilarity(articleVector, profile.vector);
    if (!Number.isFinite(similarity) || similarity <= 0) continue;

    const topicBonus = topicKey && profile.topicKey && topicKey === profile.topicKey ? 0.08 : 0;
    const profileStrength = 1 - Math.exp(-Math.max(profile.effectiveWeight, 0) / 3);
    const affinityScore = clamp(similarity * profileStrength + topicBonus, 0, 1);

    if (affinityScore > best.affinityScore) {
      const profileLabel = profile.label || profile.topicKey || `island #${profile.id}`;
      best = {
        affinityScore,
        profileId: profile.id,
        profileLabel,
        effectiveWeight: profile.effectiveWeight
      };
    }
  }

  return best;
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
    if (nextWeight <= 0.05) {
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
  if (!clusterId) {
    return null;
  }

  const topicKey = cluster?.topicKey ?? null;

  // Update cluster affinity regardless of signal type.
  const affinityRow = await upsertClusterAffinity({
    userId: loadedArticle.userId,
    clusterId,
    topicKey,
    delta,
    isStar,
    isClick
  });

  // Check if cluster affinity crossed promotion threshold.
  let profileRow = null;
  if (affinityRow && Number(affinityRow.affinity) >= ISLAND_PROMOTION_THRESHOLD) {
    profileRow = await promoteClusterAffinityToIsland({
      userId: loadedArticle.userId,
      clusterId,
      affinity: Number(affinityRow.affinity),
      starCount: Number(affinityRow.starCount) || 0,
      clickCount: Number(affinityRow.clickCount) || 0
    });
  }

  await upsertInterestProfile({ userId: loadedArticle.userId, article: loadedArticle, delta, isStar, isClick });
  invalidateCachedSuppressionSignals(loadedArticle.userId);

  return {
    affinityRow,
    profileRow
  };
}

const RECOMMENDATION_STEERING_WEIGHTS = {
  more: { cluster: 2, profile: 1.5 },
  less: { cluster: -1.5, profile: -1.25 },
  ignore: { cluster: -3, profile: -2.5 }
};

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

// Coverage rewards topic groups that have enough corroborating articles.
function articleInterestVector(article) {
  return resolveInterestVector(article);
}

function scoreArticleAgainstProfiles(article, profiles) {
  const cluster = article.get?.('cluster') ?? article.cluster;
  const vector = articleInterestVector(article);
  const topicKey = cluster?.topicKey ?? null;
  const match = scoreProfileMatch(vector, topicKey, profiles);

  if (!match.profileId || Number(match.affinityScore) < RANKING_AFFINITY_THRESHOLD) {
    return {
      affinityScore: 0,
      profileId: null,
      profileLabel: null,
      profileInteractionCount: 0,
      profileStarCount: 0,
      profileClickCount: 0
    };
  }

  const matchedProfile = profiles.find(profile => profile.id === match.profileId);
  return {
    affinityScore: match.affinityScore,
    profileId: match.profileId,
    profileLabel: match.profileLabel,
    profileInteractionCount: matchedProfile?.interactionCount || 0,
    profileStarCount: matchedProfile?.starCount || 0,
    profileClickCount: matchedProfile?.clickCount || 0
  };
}

function constrainIslandAttachmentDensity(scoredArticles) {
  if (!Array.isArray(scoredArticles) || scoredArticles.length === 0) {
    return scoredArticles;
  }

  const matched = scoredArticles
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => item.profileId && Number(item.affinityScore) >= RANKING_AFFINITY_THRESHOLD)
    .sort((left, right) => Number(right.item.affinityScore) - Number(left.item.affinityScore));

  const totalCount = scoredArticles.length;
  const minAttach = Math.floor(totalCount * MIN_ISLAND_ATTACH_RATIO);
  const targetAttach = Math.round(totalCount * TARGET_ISLAND_ATTACH_RATIO);
  const maxAttach = Math.ceil(totalCount * MAX_ISLAND_ATTACH_RATIO);

  let keepCount = Math.min(targetAttach, maxAttach);
  if (matched.length < keepCount) {
    keepCount = matched.length;
  } else if (keepCount < minAttach && matched.length >= minAttach) {
    keepCount = minAttach;
  }

  const keepIndexes = new Set(matched.slice(0, keepCount).map(({ index }) => index));

  return scoredArticles.map((item, index) => {
    if (keepIndexes.has(index)) {
      return item;
    }

    const demotedScore = clamp(
      (0.3 * item.recommendedBase) * item.freshnessFactor * (1 - (Number(item.suppressionPenalty) || 0)),
      0,
      1
    );

    return {
      ...item,
      profileId: null,
      profileLabel: null,
      profileInteractionCount: 0,
      profileStarCount: 0,
      profileClickCount: 0,
      normalizedAffinity: 0,
      affinityScore: 0,
      score: demotedScore
    };
  });
}

/**
 * Main read path for RECOMMENDED sort.
 *
 * Flow:
 * - Load active user profiles.
 * - Score each candidate article against those profiles and recommended baseline.
 * - Sort descending by recommended score.
 * - Apply lightweight diversification.
 */
export async function rankRecommendedArticles({ userId, articles = [] } = {}) {
  if (!userId || !Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const profiles = await loadInterestProfiles(userId);
  const suppressionSignals = await loadSuppressionSignals(userId);

  const scoredArticles = articles.map(article => {
    const cluster = article.get?.('cluster') ?? article.cluster;
    const scoreParts = scoreArticleAgainstProfiles(article, profiles);

    const affinityScore = scoreParts.affinityScore;
    const recommendedBase = clamp(Number(computeRecommended(article) ?? 0), 0, 1);
    const rawFreshness = Number(article?.freshness ?? 0.5);
    const freshness = Number.isFinite(rawFreshness) ? clamp(rawFreshness, 0, 1) : 0.5;
    const flooredFreshness = Math.max(0.05, freshness);
    const normalizedAffinity = Math.pow(clamp(affinityScore, 0, 1), 1.4);
    const freshnessFactor = 0.25 + flooredFreshness * 0.75;
    const suppressionDebug = scoreSuppressionPenalty(article, suppressionSignals);
    const suppressionPenalty = suppressionDebug.penalty;
    const scoreBeforeSuppression = clamp(
      (normalizedAffinity * 0.7 + recommendedBase * 0.3) * freshnessFactor,
      0,
      1
    );
    const score = clamp(scoreBeforeSuppression * (1 - suppressionPenalty), 0, 1);

    return {
      article,
      profileId: scoreParts.profileId,
      profileLabel: scoreParts.profileLabel,
      profileInteractionCount: scoreParts.profileInteractionCount,
      profileStarCount: scoreParts.profileStarCount,
      profileClickCount: scoreParts.profileClickCount,
      clusterId: cluster?.id ?? article.clusterId ?? null,
      topicKey: cluster?.topicKey ?? null,
      normalizedAffinity,
      freshnessFactor,
      suppressionPenalty,
      suppressionSource: suppressionDebug.source,
      suppressionReason: suppressionDebug.reason,
      suppressionComponents: suppressionDebug.components,
      affinityScore,
      recommendedBase,
      score
    };
  });

  const constrained = constrainIslandAttachmentDensity(scoredArticles);
  constrained.sort((left, right) => right.score - left.score);

  return constrained;
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
