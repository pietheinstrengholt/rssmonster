/**
 * Interest Profile Merge Service
 *
 * Background maintenance for consolidating near-duplicate semantic interest islands.
 *
 * Why semantic merging:
 * Users develop overlapping interests naturally over time. Without consolidation,
 * the recommendation system fragments across semantically-similar near-duplicate islands.
 * Merging reduces noise, strengthens personalization, and improves ranking confidence.
 *
 * Why vector similarity:
 * Labels/names are unstable (users retitle), keywords are subjective. Vector embeddings
 * capture true semantic content across language variance. Only cosine similarity matters.
 *
 * Merge strategy:
 * - Higher-weight (mature) profile survives
 * - Lower-weight (younger) profile is absorbed
 * - Vectors are blended by weight, normalized after
 * - Stats (interactions, stars, clicks) are summed
 * - topicKey is preserved from survivor
 * - label is preserved from survivor
 * - lastSeen reflects the most recent interaction
 */

import db from '../models/index.js';
import { cosineSimilarity } from './vectorMath.js';
import { blendVectors, normalizeVector } from './interestIsland.service.js';
import { invalidateCachedProfiles } from './profileSelector.service.js';
import { PROFILE_MERGE_THRESHOLD } from '../config/ranking.config.js';

const { UserInterestProfile, sequelize } = db;

const nowUtc = () => new Date();

/**
 * Resolve the effective merge threshold, considering environment overrides.
 * Can be overridden by PROFILE_MERGE_THRESHOLD env var.
 *
 * @returns {number} The profile merge threshold (0–1)
 */
function resolveMergeThreshold() {
  const envOverride = Number(process.env.PROFILE_MERGE_THRESHOLD);
  if (Number.isFinite(envOverride) && envOverride > 0 && envOverride <= 1) {
    return envOverride;
  }
  return PROFILE_MERGE_THRESHOLD;
}

/**
 * Validate vector for safety and shape.
 *
 * @param {*} vector - The vector to validate
 * @returns {boolean} True if vector is valid and usable
 */
function isValidVector(vector) {
  return Array.isArray(vector) && vector.length > 0 && vector.every(v => Number.isFinite(v));
}

/**
 * Compute cosine similarity with safety checks.
 * Returns 0 if vectors are invalid or cannot be compared.
 *
 * @param {*} v1 - First vector
 * @param {*} v2 - Second vector
 * @returns {number} Similarity score (0–1), or 0 if invalid
 */
function safeSimilarity(v1, v2) {
  if (!isValidVector(v1) || !isValidVector(v2)) {
    return 0;
  }

  if (v1.length !== v2.length) {
    return 0;
  }

  const sim = cosineSimilarity(v1, v2);
  return Number.isFinite(sim) ? Math.max(0, sim) : 0;
}

/**
 * Merge two interest profiles semantically.
 *
 * Semantics:
 * - primary (higher weight) survives as the target
 * - secondary (lower weight) is absorbed
 * - Vectors are blended by weight, normalized
 * - Stats (weight, interactions, stars, clicks) are summed
 * - lastSeen reflects the most recent timestamp
 * - topicKey, label preserved from primary
 *
 * @param {Object} primary - Surviving profile (higher weight)
 * @param {Object} secondary - Absorbed profile (lower weight)
 * @returns {Promise<void>}
 */
async function mergeProfilePair(primary, secondary) {
  if (!primary || !secondary) {
    return;
  }

  // Validate vectors
  const primaryVector = normalizeVector(primary.vector);
  const secondaryVector = normalizeVector(secondary.vector);

  if (!isValidVector(primaryVector) || !isValidVector(secondaryVector)) {
    console.log(
      `[ISLAND MERGE] skipped profile pair ${primary.id} + ${secondary.id}: invalid vectors`
    );
    return;
  }

  // Blend vectors proportionally by weight
  const mergedVector = normalizeVector(
    blendVectors(
      primaryVector,
      secondaryVector,
      Number(primary.weight) || 1,
      Number(secondary.weight) || 1
    )
  );

  if (!isValidVector(mergedVector)) {
    console.log(
      `[ISLAND MERGE] skipped profile pair ${primary.id} + ${secondary.id}: merge vector invalid`
    );
    return;
  }

  // Accumulate stats
  const mergedWeight = (Number(primary.weight) || 0) + (Number(secondary.weight) || 0);
  const mergedInteractionCount = (Number(primary.interactionCount) || 0) + (Number(secondary.interactionCount) || 0);
  const mergedStarCount = (Number(primary.starCount) || 0) + (Number(secondary.starCount) || 0);
  const mergedClickCount = (Number(primary.clickCount) || 0) + (Number(secondary.clickCount) || 0);

  // Most recent lastSeen
  const primarySeen = new Date(primary.lastSeen || 0).getTime();
  const secondarySeen = new Date(secondary.lastSeen || 0).getTime();
  const mergedLastSeen = primarySeen > secondarySeen ? primary.lastSeen : secondary.lastSeen;

  // Update primary with merged data
  await primary.update({
    vector: mergedVector,
    weight: Number(mergedWeight.toFixed(4)),
    interactionCount: mergedInteractionCount,
    starCount: mergedStarCount,
    clickCount: mergedClickCount,
    lastSeen: mergedLastSeen || nowUtc()
  });

  // Destroy secondary
  await secondary.destroy();
}

/**
 * Merge interest profiles for a user semantically.
 *
 * Consolidates near-duplicate islands (cosine similarity >= threshold)
 * into stronger, more durable long-term profiles.
 *
 * Algorithm:
 * 1. Fetch all profiles for user, ordered by weight (highest first)
 * 2. For each profile pair: compute semantic similarity
 * 3. If similarity >= threshold: merge into higher-weight profile
 * 4. Invalidate profile cache after all merges
 * 5. Log summary of merge activity
 *
 * Safety:
 * - Never merge a profile twice in one pass (track with mergedIds set)
 * - Skip invalid/missing vectors
 * - Skip self-merges
 * - Validate vectors before comparison and after blending
 *
 * @param {number} userId - User ID to merge profiles for
 * @returns {Promise<Object>} Merge summary { before, after, mergedCount, threshold }
 */
export async function mergeInterestProfilesForUser(userId) {
  if (!userId) {
    return { before: 0, after: 0, mergedCount: 0, threshold: null };
  }

  const threshold = resolveMergeThreshold();

  // Fetch all profiles, ordered by weight (highest first = most mature)
  const profiles = await UserInterestProfile.findAll({
    where: { userId },
    order: [['weight', 'DESC']],
    raw: false
  });

  const before = profiles.length;
  const mergedIds = new Set();
  let mergedCount = 0;

  // Compare each profile pair
  for (let i = 0; i < profiles.length; i++) {
    const primary = profiles[i];

    // Skip if this profile was already merged into another
    if (mergedIds.has(primary.id)) {
      continue;
    }

    for (let j = i + 1; j < profiles.length; j++) {
      const secondary = profiles[j];

      // Skip if secondary was already merged
      if (mergedIds.has(secondary.id)) {
        continue;
      }

      // Compute semantic similarity
      const similarity = safeSimilarity(
        normalizeVector(primary.vector),
        normalizeVector(secondary.vector)
      );

      if (similarity < threshold) {
        console.log(
          `[ISLAND MERGE] skipped profile pair similarity=${similarity.toFixed(3)} (threshold=${threshold.toFixed(3)})`
        );
        continue;
      }

      // Merge secondary into primary
      console.log(
        `[ISLAND MERGE] merged profile ${secondary.id} into ${primary.id} (similarity=${similarity.toFixed(3)})`
      );

      try {
        await mergeProfilePair(primary, secondary);
        mergedIds.add(secondary.id);
        mergedCount += 1;
      } catch (err) {
        console.error(
          `[ISLAND MERGE] error merging profile ${secondary.id} into ${primary.id}:`,
          err
        );
      }
    }
  }

  // Invalidate cache after all merges
  if (mergedCount > 0) {
    invalidateCachedProfiles(userId);
  }

  const after = before - mergedCount;

  console.log(
    `[ISLAND MERGE] completed for user ${userId}: ${before} -> ${after} profiles (${mergedCount} merged, threshold=${threshold.toFixed(3)})`
  );

  return {
    before,
    after,
    mergedCount,
    threshold: Number(threshold.toFixed(3))
  };
}

/**
 * Merge interest profiles for all users.
 *
 * Background maintenance task that iterates all users with profiles
 * and triggers semantic merging for each.
 *
 * Useful for:
 * - Scheduled maintenance (e.g., weekly consolidation)
 * - Post-import cleanup (after large feed additions)
 * - Manual cleanup triggered via admin interface
 *
 * @returns {Promise<Object>} Summary { totalUsers, totalBefore, totalAfter, totalMerged }
 */
export async function mergeAllInterestProfiles() {
  // Find all distinct users with profiles
  const userIds = await UserInterestProfile.findAll({
    attributes: [['userId', 'userId']],
    where: { userId: { [sequelize.Sequelize.Op.ne]: null } },
    raw: true,
    group: ['userId'],
    subQuery: false
  });

  if (!userIds || userIds.length === 0) {
    console.log('[ISLAND MERGE] no users with profiles found');
    return {
      totalUsers: 0,
      totalBefore: 0,
      totalAfter: 0,
      totalMerged: 0
    };
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let totalMerged = 0;

  console.log(`[ISLAND MERGE] starting merge pass for ${userIds.length} users`);

  for (const row of userIds) {
    const userId = row.userId || row.get?.('userId');

    if (!userId) {
      continue;
    }

    try {
      const result = await mergeInterestProfilesForUser(userId);
      totalBefore += result.before;
      totalAfter += result.after;
      totalMerged += result.mergedCount;
    } catch (err) {
      console.error(`[ISLAND MERGE] error processing user ${userId}:`, err);
    }
  }

  console.log(
    `[ISLAND MERGE] merge pass complete: ${totalBefore} -> ${totalAfter} total profiles (${totalMerged} merged across ${userIds.length} users)`
  );

  return {
    totalUsers: userIds.length,
    totalBefore,
    totalAfter,
    totalMerged
  };
}
