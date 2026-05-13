/**
 * Profile Selector Service
 *
 * Responsibilities:
 * - Load user interest profiles (with caching)
 * - Select diverse profiles using engagement-based max and similarity-based de-duplication
 * - Score article matches against profile collection
 */

import db from '../models/index.js';
import { cosineSimilarity } from './vectorMath.js';
import { fn, col } from 'sequelize';

const { UserInterestProfile, UserClusterAffinity } = db;

// Keep ranking focused on a small active set for predictable latency.
const DEFAULT_MAX_ACTIVE_PROFILES = 8;
const ACTIVE_PROFILE_CANDIDATE_LIMIT = Math.max(
  DEFAULT_MAX_ACTIVE_PROFILES,
  Number(process.env.INTEREST_ISLAND_PROFILE_CANDIDATE_LIMIT) || (DEFAULT_MAX_ACTIVE_PROFILES * 8)
);
const PROFILE_MATCH_THRESHOLD = 0.72;
const PROFILE_HALF_LIFE_HOURS = 336;
const PROFILE_CACHE_TTL_MS = 30_000;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// userId -> { profiles, expiresAt }
const interestProfileCache = new Map();

const nowMs = () => Date.now();

const normalizeVector = (vector) => {
  if (!Array.isArray(vector)) return null;
  return vector.map(value => Number(value) || 0);
};

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

export const invalidateCachedProfiles = (userId) => {
  if (!userId) return;
  interestProfileCache.delete(userId);
};

export function selectDiverseProfiles(profiles, {
  maxProfiles = DEFAULT_MAX_ACTIVE_PROFILES,
  similarityThreshold = 0.88
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

export function resolveProfileSimilarityThreshold(maxProfiles) {
  const profiles = Math.max(Number(maxProfiles) || 4, 1);

  // More profiles -> stricter diversity requirement
  // 4 profiles  -> 0.92
  // 6 profiles  -> 0.88
  // 8 profiles  -> 0.84
  // 10 profiles -> 0.82
  // 12 profiles -> 0.80
  return Math.max(
    0.80,
    Math.min(
      0.92,
      0.92 - ((profiles - 4) * 0.015)
    )
  );
}

export function resolveMaxActiveProfiles({
  starCount = 0,
  clickCount = 0
} = {}) {
  // Stars matter far more than clicks
  const engagementScore =
    starCount +
    Math.min(clickCount / 10, 50);

  return Math.max(
    4,
    Math.min(
      12,
      Math.round(4 + Math.log2(engagementScore + 1))
    )
  );
}

export async function loadInterestProfiles(userId) {
  // Read-through cache: DB only on miss/expiry.
  const cachedProfiles = readCachedProfiles(userId);
  if (cachedProfiles) {
    return cachedProfiles.map(profile => ({
      ...profile,
      effectiveWeight: (Number(profile.weight) || 0) * decayMultiplier(profile.lastSeen, PROFILE_HALF_LIFE_HOURS)
    }));
  }

  const [rows, engagementTotals] = await Promise.all([
    UserInterestProfile.findAll({
      where: { userId },
      order: [['weight', 'DESC'], ['lastSeen', 'DESC']],
      // Pull a wider candidate set, then diversify into active profiles.
      limit: ACTIVE_PROFILE_CANDIDATE_LIMIT
    }),
    UserClusterAffinity.findOne({
      where: { userId },
      attributes: [
        [fn('SUM', col('starCount')), 'starCount'],
        [fn('SUM', col('clickCount')), 'clickCount']
      ],
      raw: true
    })
  ]);

  const maxActiveProfiles = resolveMaxActiveProfiles({
    starCount: Number(engagementTotals?.starCount) || 0,
    clickCount: Number(engagementTotals?.clickCount) || 0
  });
  const profileSimilarityThreshold = resolveProfileSimilarityThreshold(maxActiveProfiles);

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
    maxProfiles: maxActiveProfiles,
    similarityThreshold: profileSimilarityThreshold
  });

  writeCachedProfiles(userId, profiles);

  return profiles.map(profile => ({
    ...profile,
    effectiveWeight: (Number(profile.weight) || 0) * decayMultiplier(profile.lastSeen, PROFILE_HALF_LIFE_HOURS)
  }));
}

export function scoreProfileMatch(articleVector, topicKey, profiles) {
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

export const PROFILE_MATCH_THRESHOLD_EXPORT = PROFILE_MATCH_THRESHOLD;
