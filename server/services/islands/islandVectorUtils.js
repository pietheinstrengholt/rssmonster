import {
  blendVector,
  cosineSimilarity as sharedCosineSimilarity,
  normalizeVector as sharedNormalizeVector,
  weightedAverageVector as sharedWeightedAverageVector
} from '../vectors/index.js';

// Defines the default max islands per user enforced by this service.
export const DEFAULT_MAX_ISLANDS_PER_USER = Number.parseInt(process.env.MAX_INTEREST_ISLANDS, 10) || 10;
// Defines the default topic affinity threshold enforced by this service.
export const DEFAULT_TOPIC_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_AFFINITY_THRESHOLD || '0.12');
// Defines the default article affinity threshold enforced by this service.
export const DEFAULT_ARTICLE_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_AFFINITY_THRESHOLD || '0.64');
// Defines the default max communities per topic enforced by this service.
export const DEFAULT_MAX_COMMUNITIES_PER_TOPIC = Number.parseInt(process.env.ISLAND_MAX_COMMUNITIES_PER_TOPIC, 10) || 2;
// Defines the default topic confidence threshold enforced by this service.
export const DEFAULT_TOPIC_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_CONFIDENCE_THRESHOLD || '0.10');
// Defines the default article signal threshold enforced by this service.
export const DEFAULT_ARTICLE_SIGNAL_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_SIGNAL_THRESHOLD || '0.05');
// Defines the default topic enrichment similarity threshold enforced by this service.
export const DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD || '0.62'
);
// Defines the default island match threshold enforced by this service.
export const DEFAULT_ISLAND_MATCH_THRESHOLD = Number.parseFloat(process.env.ISLAND_PROFILE_MATCH_THRESHOLD || '0.78');
// Defines the default island vector alpha enforced by this service.
export const DEFAULT_ISLAND_VECTOR_ALPHA = Number.parseFloat(process.env.ISLAND_VECTOR_ALPHA || '0.35');
// Defines the default recency half life days enforced by this service.
export const DEFAULT_RECENCY_HALF_LIFE_DAYS = Number.parseFloat(process.env.ISLAND_RECENCY_HALF_LIFE_DAYS || '1460');
// Defines the default recency min weight enforced by this service.
export const DEFAULT_RECENCY_MIN_WEIGHT = Number.parseFloat(process.env.ISLAND_RECENCY_MIN_WEIGHT || '0.2');
// Defines the default archive confidence threshold enforced by this service.
export const DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD || '0.12');
// Defines the default archive stale days enforced by this service.
export const DEFAULT_ARCHIVE_STALE_DAYS = Number.parseInt(process.env.ISLAND_ARCHIVE_STALE_DAYS, 10) || 45;
// Defines the default audit max runs enforced by this service.
export const DEFAULT_AUDIT_MAX_RUNS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_RUNS, 10) || 30;
// Defines the default audit max article ids enforced by this service.
export const DEFAULT_AUDIT_MAX_ARTICLE_IDS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_ARTICLE_IDS, 10) || 300;
// Defines the default island membership decay enforced by this service.
export const DEFAULT_ISLAND_MEMBERSHIP_DECAY = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_DECAY || '0.82');
// Defines the default island membership blend enforced by this service.
export const DEFAULT_ISLAND_MEMBERSHIP_BLEND = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_BLEND || '0.65');
// Defines the default island membership min confidence enforced by this service.
export const DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_MIN_CONFIDENCE || '0.05');
// Defines the default engagement time bucket hours enforced by this service.
export const DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS = Number.parseInt(process.env.ISLAND_ENGAGEMENT_TIME_BUCKET_HOURS, 10) || 12;
// Defines the default temporal affinity weight enforced by this service.
export const DEFAULT_TEMPORAL_AFFINITY_WEIGHT = Number.parseFloat(process.env.ISLAND_TEMPORAL_AFFINITY_WEIGHT || '0.65');
// Defines the island debug enforced by this service.
export const ISLAND_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.ISLAND_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

// Defines the signal weights enforced by this service.
export const SIGNAL_WEIGHTS = {
  positive: 4,
  star: 4,
  click: 2,
  deepRead: 1,
  negative: 4,
  topicAffinity: 2,
  eventCount: 0.25
};

// These helpers keep scores bounded and avoid zero weights in weighted averages.
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
// This helper converts topic strength into a safe positive sample weight.
export const topicMagnitude = (strength) => Math.max(0.0001, Math.abs(Number(strength || 0)));
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
export function topicRecencyWeight(publishedAt) {
  // Returns early when published at is unavailable.
  if (!publishedAt) return 1;

  // Derives the age days through max while performing topic recency weight.
  const ageDays = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));
  // Selects the half life days based on whether default recency half life days is finite and default recency half life days exceeds value.
  const halfLifeDays = Number.isFinite(DEFAULT_RECENCY_HALF_LIFE_DAYS) && DEFAULT_RECENCY_HALF_LIFE_DAYS > 0
    ? DEFAULT_RECENCY_HALF_LIFE_DAYS
    : 1460;
  // Selects the min weight based on whether default recency min weight is finite.
  const minWeight = clamp(
    Number.isFinite(DEFAULT_RECENCY_MIN_WEIGHT) ? DEFAULT_RECENCY_MIN_WEIGHT : 0.2,
    0,
    1
  );
  // Derives the decay weight through exp while performing topic recency weight.
  const decayWeight = Math.exp(-ageDays / halfLifeDays);

  return clamp(Math.max(minWeight, decayWeight), 0, 1);
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
  // Selects the updated at based on whether updated at is available.
  const updatedAt = island?.updatedAt ? new Date(island.updatedAt).getTime() : null;
  // Returns early when updated at is not finite.
  if (!Number.isFinite(updatedAt)) return true;

  // Derives the stale ms required while checking stale island.
  const staleMs = DEFAULT_ARCHIVE_STALE_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - updatedAt) >= staleMs;
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

// This function derives a fallback island label from the strongest topic names.
export function resolveTopicFallbackLabel(profile) {
  // Keeps the names entries eligible while resolving topic fallback label.
  const names = (profile?.topics || [])
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  // Returns no result when names is empty.
  if (!names.length) return null;
  // Returns early when names count is 1.
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}
