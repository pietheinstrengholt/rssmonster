import {
  blendVector,
  cosineSimilarity as sharedCosineSimilarity,
  normalizeVector as sharedNormalizeVector,
  weightedAverageVector as sharedWeightedAverageVector
} from '../vectors/index.js';

// Reject partial numbers and bound accidental configurations; invalid values use the product default.
const parseIslandCapacity = (value, fallback) => {
  const text = String(value ?? '').trim();
  const capacity = /^\d+$/.test(text) ? Number.parseInt(text, 10) : NaN;
  return Number.isSafeInteger(capacity) && capacity > 0 && capacity <= 1000 ? capacity : fallback;
};
// Maximum simultaneously active persisted Islands, excluding archived history.
export const DEFAULT_MAX_ISLANDS_PER_USER = parseIslandCapacity(process.env.MAX_INTEREST_ISLANDS, 20);
// Internal callers may request a smaller working set, never bypass the configured active cap.
export const resolveIslandCapacity = value => Math.min(DEFAULT_MAX_ISLANDS_PER_USER, parseIslandCapacity(value, DEFAULT_MAX_ISLANDS_PER_USER));
// Defines the default article affinity threshold enforced by this service.
export const DEFAULT_ARTICLE_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_AFFINITY_THRESHOLD || '0.64');
// Defines the default article signal threshold enforced by this service.
export const DEFAULT_ARTICLE_SIGNAL_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_SIGNAL_THRESHOLD || '0.05');
// Defines the default island match threshold enforced by this service.
export const DEFAULT_ISLAND_MATCH_THRESHOLD = Number.parseFloat(process.env.ISLAND_PROFILE_MATCH_THRESHOLD || '0.78');
// Defines the default island vector alpha enforced by this service.
export const DEFAULT_ISLAND_VECTOR_ALPHA = Number.parseFloat(process.env.ISLAND_VECTOR_ALPHA || '0.35');
const configuredHalfLife = (name, fallback) => {
  const days = Number(process.env[name]);
  return Number.isFinite(days) && days > 0 ? days : fallback;
};
// True half-lives for durable Article evidence, keyed by the signal's interaction clock.
export const SIGNAL_HALF_LIFE_DAYS = Object.freeze({
  lastClickedAt: configuredHalfLife('ISLAND_CLICK_HALF_LIFE_DAYS', 30),
  lastMeaningfulReadAt: configuredHalfLife('ISLAND_DEEP_READ_HALF_LIFE_DAYS', 90),
  favoritedAt: configuredHalfLife('ISLAND_FAVORITE_HALF_LIFE_DAYS', 365),
  positiveFeedbackAt: configuredHalfLife('ISLAND_POSITIVE_FEEDBACK_HALF_LIFE_DAYS', 730),
  negativeFeedbackAt: configuredHalfLife('ISLAND_NEGATIVE_FEEDBACK_HALF_LIFE_DAYS', 365)
});
// Defines the default archive confidence threshold enforced by this service.
export const DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD || '0.12');
// Defines the default archive stale days enforced by this service.
export const DEFAULT_ARCHIVE_STALE_DAYS = Number.parseInt(process.env.ISLAND_ARCHIVE_STALE_DAYS, 10) || 45;
// Defines the default audit max runs enforced by this service.
export const DEFAULT_AUDIT_MAX_RUNS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_RUNS, 10) || 30;
// Defines the default audit max article ids enforced by this service.
export const DEFAULT_AUDIT_MAX_ARTICLE_IDS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_ARTICLE_IDS, 10) || 300;
// Defines the island debug enforced by this service.
export const ISLAND_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.ISLAND_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

// Defines the signal weights enforced by this service.
export const SIGNAL_WEIGHTS = {
  positive: 8,
  star: 4,
  click: 2,
  deepRead: 1,
  negative: 8,
};

// These helpers keep scores bounded and avoid zero weights in weighted averages.
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
// This helper converts article score into a safe positive sample weight.
export const articleMagnitude = (score) => Math.max(0.0001, Math.abs(Number(score || 0)));

// This function writes island debug output when island debugging is enabled.
export function debugIsland(message, payload = null) {
  // Returns early when island debug is unavailable.
  if (!ISLAND_DEBUG) return;

  // Handles the case where payload is value.
  if (payload == null) {
    console.log(`[ISLAND DEBUG] ${message}`);
    return;
  }

  console.log(`[ISLAND DEBUG] ${message}`, payload);
}

// Derives the cosine similarity required for this service.
export const cosineSimilarity = sharedCosineSimilarity;
// Derives the normalize vector required for this service.
export const normalizeVector = sharedNormalizeVector;
// Derives the weighted average vector required for this service.
export const weightedAverageVector = sharedWeightedAverageVector;

// This function orders island rows by strongest weight first with stable ID tie-breaking.
export function sortIslandsByWeight(islands = []) {
  // Orders values deterministically while performing sort islands by weight.
  return islands.sort((a, b) =>
    (Number(b.weight || 0) - Number(a.weight || 0)) ||
    (Number(a.id || 0) - Number(b.id || 0))
  );
}

// This function blends an existing island vector with new evidence.
export function blendIslandVector(existingVector, incomingVector, alpha = DEFAULT_ISLAND_VECTOR_ALPHA) {
  // Returns early when existing vector is not an array.
  if (!Array.isArray(existingVector)) return normalizeVector(incomingVector);
  // Returns early when incoming vector is not an array.
  if (!Array.isArray(incomingVector)) return normalizeVector(existingVector);
  // Returns early when existing vector count is not incoming vector count.
  if (existingVector.length !== incomingVector.length) return normalizeVector(incomingVector);

  return normalizeVector(blendVector(existingVector, incomingVector, alpha));
}

// This function returns a recency multiplier for behavioral signals.
export function behaviorRecencyWeight(interactedAt, halfLifeDays) {
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) throw new RangeError('Behavior half-life must be positive and finite');
  // Preserve unknown-age behavior when neither a usable interaction nor legacy date exists.
  if (!interactedAt) return 1;
  const timestamp = new Date(interactedAt).getTime();
  if (!Number.isFinite(timestamp)) return 1;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  return 2 ** (-ageDays / halfLifeDays);
}

// This function creates an empty positive-signal counter object.
export function buildPositiveSignalsAccumulator() {
  return {
    positives: 0,
    stars: 0,
    clicks: 0,
    deepReads: 0,
    negatives: 0
  };
}

// This function adds one positive-signal counter into another.
export function addPositiveSignals(target, source) {
  target.positives += source.positives || 0;
  target.stars += source.stars;
  target.clicks += source.clicks;
  target.deepReads += source.deepReads;
  target.negatives += source.negatives || 0;
}

// This function converts stored signal JSON into numeric counters.
export function normalizePositiveSignals(source = {}) {
  return {
    positives: Number(source.positives || 0),
    stars: Number(source.stars || 0),
    clicks: Number(source.clicks || 0),
    deepReads: Number(source.deepReads || 0),
    negatives: Number(source.negatives || 0)
  };
}

// This function merges existing and incoming positive-signal counters.
export function mergePositiveSignals(existingSignals = {}, incomingSignals = {}) {
  // Normalizes the merged before performing merge positive signals.
  const merged = normalizePositiveSignals(existingSignals);
  // Normalizes the incoming before performing merge positive signals.
  const incoming = normalizePositiveSignals(incomingSignals);

  merged.positives += incoming.positives;
  merged.stars += incoming.stars;
  merged.clicks += incoming.clicks;
  merged.deepReads += incoming.deepReads;
  merged.negatives += incoming.negatives;

  return merged;
}

// This function decides whether an island has gone stale enough for archival handling.
export function isStaleIsland(island) {
  // Database writes and audit timestamps are not behavioral activity.
  const lastBehaviorAt = island?.lastBehaviorAt ? new Date(island.lastBehaviorAt).getTime() : null;
  if (!Number.isFinite(lastBehaviorAt)) return true;

  // Derives the stale ms required while checking stale island.
  const staleMs = DEFAULT_ARCHIVE_STALE_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - lastBehaviorAt) >= staleMs;
}

// This function picks the nearest active taxonomy display name for an island vector.
export function resolveTaxonomyDisplayName(vector, taxonomyRows = []) {
  // Returns no result when vector is not an array or vector is empty.
  if (!Array.isArray(vector) || !vector.length) return null;

  let bestName = null;
  let bestSimilarity = -1;

  // Processes each taxonomy rows entry in turn.
  for (const row of taxonomyRows) {
    // Derives the similarity through cosine similarity while resolving taxonomy display name.
    const similarity = cosineSimilarity(vector, row.vector);
    // Handles the case where similarity exceeds best similarity.
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestName = row.displayName;
    }
  }

  return bestName || null;
}
