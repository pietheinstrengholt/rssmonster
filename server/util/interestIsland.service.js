import db from '../models/index.js';
import { cosineSimilarity, resolveArticleVector } from './vectorMath.js';

const { Article, ArticleCluster, UserClusterAffinity, UserInterestProfile } = db;

/**
 * Interest island service
 *
 * Responsibilities:
 * 1) Convert user interaction events into weighted reinforcement deltas.
 * 2) Persist per-cluster affinity and per-user semantic interest profiles.
 * 3) Rank candidate articles for RECOMMENDED sort using profile affinity + quality signals.
 *
 * Data model split:
 * - UserClusterAffinity: fast reinforcement signal tied to cluster ids.
 * - UserInterestProfile: semantic "islands" (vector + weight) used at ranking time.
 */

const AFFINITY_HALF_LIFE_HOURS = 168;
const PROFILE_HALF_LIFE_HOURS = 336;
// Keep ranking focused on a small active set for predictable latency.
const MAX_ACTIVE_PROFILES = 8;
const PROFILE_MATCH_THRESHOLD = 0.82;
// Cluster affinity threshold for promotion to interest island.
// ~5 clicks or 1 star + 2 clicks = enough evidence to carve out an island.
const ISLAND_PROMOTION_THRESHOLD = 5;
// Short-lived in-memory cache to avoid repeated profile reads on hot requests.
const PROFILE_CACHE_TTL_MS = 30_000;

// Interaction deltas used to reinforce (or penalize) interest islands.
const INTERACTION_WEIGHTS = {
  star: 3,
  click: 1,
  negative: -2
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// userId -> { profiles, expiresAt }
const interestProfileCache = new Map();

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
async function upsertClusterAffinity({ userId, clusterId, topicKey, delta }) {
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
    lastInteractionAt: nowUtc()
  };

  if (current) {
    await current.update(payload);
    return current;
  }

  return UserClusterAffinity.create(payload);
}

// Promote cluster affinity to island if threshold is crossed.
// Finds or creates an island for the given cluster when accumulated affinity is hot enough.
async function promoteClusterAffinityToIsland({ userId, clusterId, affinity }) {
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
    // Serve only the strongest islands at ranking time.
    limit: MAX_ACTIVE_PROFILES
  });

  const profiles = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      label: row.label,
      topicKey: row.topicKey,
      vector: normalizeVector(row.vector),
      weight: Number(row.weight) || 0,
      interactionCount: Number(row.interactionCount) || 0,
      lastSeen: row.lastSeen
    }));

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
async function upsertInterestProfile({ userId, article, delta }) {
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
    delta
  });

  // Check if cluster affinity crossed promotion threshold.
  let profileRow = null;
  if (affinityRow && Number(affinityRow.affinity) >= ISLAND_PROMOTION_THRESHOLD) {
    profileRow = await promoteClusterAffinityToIsland({
      userId: loadedArticle.userId,
      clusterId,
      affinity: Number(affinityRow.affinity)
    });
  }

  return {
    affinityRow,
    profileRow
  };
}

// Coverage rewards topic groups that have enough corroborating articles.
function computeCoverageScore(article) {
  const cluster = article.get?.('cluster') ?? article.cluster;
  const count = Number(
    article.topicArticleCount ??
    cluster?.articleCount ??
    0
  );

  if (!Number.isFinite(count) || count <= 1) {
    return 0;
  }

  return clamp(Math.log2(count + 1) / Math.log2(64), 0, 1);
}

function articleInterestVector(article) {
  return resolveInterestVector(article);
}

function scoreArticleAgainstProfiles(article, profiles) {
  const cluster = article.get?.('cluster') ?? article.cluster;
  const vector = articleInterestVector(article);
  const topicKey = cluster?.topicKey ?? null;
  const match = scoreProfileMatch(vector, topicKey, profiles);

  return {
    affinityScore: match.affinityScore,
    profileId: match.profileId,
    profileLabel: match.profileLabel,
    profileStrength: match.effectiveWeight,
    profileInteractionCount: profiles.find(profile => profile.id === match.profileId)?.interactionCount || 0
  };
}

// Simple diversity guardrail to avoid over-concentrating top results in one island/cluster/topic.
function diversifyRecommendedArticles(scoredArticles) {
  const selected = [];
  const overflow = [];
  const profileCounts = new Map();
  const clusterCounts = new Map();
  const topicCounts = new Map();

  for (const item of scoredArticles) {
    const profileCount = item.profileId ? (profileCounts.get(item.profileId) || 0) : 0;
    const clusterCount = item.clusterId ? (clusterCounts.get(item.clusterId) || 0) : 0;
    const topicCount = item.topicKey ? (topicCounts.get(item.topicKey) || 0) : 0;

    if (profileCount >= 2 || clusterCount >= 1 || topicCount >= 2) {
      overflow.push(item);
      continue;
    }

    selected.push(item);
    if (item.profileId) profileCounts.set(item.profileId, profileCount + 1);
    if (item.clusterId) clusterCounts.set(item.clusterId, clusterCount + 1);
    if (item.topicKey) topicCounts.set(item.topicKey, topicCount + 1);
  }

  return [...selected, ...overflow];
}

/**
 * Main read path for RECOMMENDED sort.
 *
 * Flow:
 * - Load active user profiles.
 * - Score each candidate article against those profiles and secondary signals.
 * - Sort descending by recommended score.
 * - Apply lightweight diversification.
 */
export async function rankRecommendedArticles({ userId, articles = [] } = {}) {
  if (!userId || !Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const profiles = await loadInterestProfiles(userId);

  const scoredArticles = articles.map(article => {
    const cluster = article.get?.('cluster') ?? article.cluster;
    const scoreParts = scoreArticleAgainstProfiles(article, profiles);

    const affinityScore = scoreParts.affinityScore;
    const freshness = clamp(Number(article.freshness ?? 0.5), 0, 1);
    const quality = clamp(Number(article.quality ?? 0.7), 0, 1);
    const attention = clamp(Number(article.attentionScore ?? 0), 0, 1);
    const coverage = computeCoverageScore(article);

    const score =
      0.58 * affinityScore +
      0.15 * freshness +
      0.12 * quality +
      0.10 * attention +
      0.05 * coverage;

    return {
      article,
      profileId: scoreParts.profileId,
      profileLabel: scoreParts.profileLabel,
      profileInteractionCount: scoreParts.profileInteractionCount,
      clusterId: cluster?.id ?? article.clusterId ?? null,
      topicKey: cluster?.topicKey ?? null,
      affinityScore,
      freshness,
      quality,
      attention,
      coverage,
      score
    };
  });

  scoredArticles.sort((left, right) => right.score - left.score);

  const diversified = diversifyRecommendedArticles(scoredArticles);

  return diversified;
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
