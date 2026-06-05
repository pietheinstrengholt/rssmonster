import {
  blendVector,
  cosineSimilarity as sharedCosineSimilarity,
  normalizeVector as sharedNormalizeVector,
  weightedAverageVector as sharedWeightedAverageVector
} from '../vectors/index.js';

export const DEFAULT_MAX_ISLANDS_PER_USER = Number.parseInt(process.env.MAX_INTEREST_ISLANDS, 10) || 10;
export const DEFAULT_TOPIC_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_AFFINITY_THRESHOLD || '0.12');
export const DEFAULT_ARTICLE_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_AFFINITY_THRESHOLD || '0.64');
export const DEFAULT_MAX_COMMUNITIES_PER_TOPIC = Number.parseInt(process.env.ISLAND_MAX_COMMUNITIES_PER_TOPIC, 10) || 2;
export const DEFAULT_TOPIC_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_CONFIDENCE_THRESHOLD || '0.10');
export const DEFAULT_ARTICLE_SIGNAL_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_SIGNAL_THRESHOLD || '0.05');
export const DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD || '0.62'
);
export const DEFAULT_ISLAND_MATCH_THRESHOLD = Number.parseFloat(process.env.ISLAND_PROFILE_MATCH_THRESHOLD || '0.78');
export const DEFAULT_ISLAND_VECTOR_ALPHA = Number.parseFloat(process.env.ISLAND_VECTOR_ALPHA || '0.35');
export const DEFAULT_RECENCY_HALF_LIFE_DAYS = Number.parseFloat(process.env.ISLAND_RECENCY_HALF_LIFE_DAYS || '1460');
export const DEFAULT_RECENCY_MIN_WEIGHT = Number.parseFloat(process.env.ISLAND_RECENCY_MIN_WEIGHT || '0.2');
export const DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD || '0.12');
export const DEFAULT_ARCHIVE_STALE_DAYS = Number.parseInt(process.env.ISLAND_ARCHIVE_STALE_DAYS, 10) || 45;
export const DEFAULT_AUDIT_MAX_RUNS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_RUNS, 10) || 30;
export const DEFAULT_AUDIT_MAX_ARTICLE_IDS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_ARTICLE_IDS, 10) || 300;
export const DEFAULT_ISLAND_MEMBERSHIP_DECAY = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_DECAY || '0.82');
export const DEFAULT_ISLAND_MEMBERSHIP_BLEND = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_BLEND || '0.65');
export const DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_MIN_CONFIDENCE || '0.05');
export const DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS = Number.parseInt(process.env.ISLAND_ENGAGEMENT_TIME_BUCKET_HOURS, 10) || 12;
export const DEFAULT_TEMPORAL_AFFINITY_WEIGHT = Number.parseFloat(process.env.ISLAND_TEMPORAL_AFFINITY_WEIGHT || '0.65');
export const ISLAND_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.ISLAND_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

export const SIGNAL_WEIGHTS = {
  positive: 4,
  star: 4,
  click: 1.5,
  deepRead: 3,
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
  if (!ISLAND_DEBUG) return;

  if (payload == null) {
    console.log(`[ISLAND DEBUG] ${message}`);
    return;
  }

  console.log(`[ISLAND DEBUG] ${message}`, payload);
}

export const cosineSimilarity = sharedCosineSimilarity;
export const normalizeVector = sharedNormalizeVector;
export const weightedAverageVector = sharedWeightedAverageVector;

// This function blends an existing island vector with new evidence.
export function blendIslandVector(existingVector, incomingVector, alpha = DEFAULT_ISLAND_VECTOR_ALPHA) {
  if (!Array.isArray(existingVector)) return normalizeVector(incomingVector);
  if (!Array.isArray(incomingVector)) return normalizeVector(existingVector);
  if (existingVector.length !== incomingVector.length) return normalizeVector(incomingVector);

  return normalizeVector(blendVector(existingVector, incomingVector, alpha));
}

// This function returns a recency multiplier for behavioral signals.
export function topicRecencyWeight(publishedAt) {
  if (!publishedAt) return 1;

  const ageDays = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));
  const halfLifeDays = Number.isFinite(DEFAULT_RECENCY_HALF_LIFE_DAYS) && DEFAULT_RECENCY_HALF_LIFE_DAYS > 0
    ? DEFAULT_RECENCY_HALF_LIFE_DAYS
    : 1460;
  const minWeight = clamp(
    Number.isFinite(DEFAULT_RECENCY_MIN_WEIGHT) ? DEFAULT_RECENCY_MIN_WEIGHT : 0.2,
    0,
    1
  );
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
  const merged = normalizePositiveSignals(existingSignals);
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
  const updatedAt = island?.updatedAt ? new Date(island.updatedAt).getTime() : null;
  if (!Number.isFinite(updatedAt)) return true;

  const staleMs = DEFAULT_ARCHIVE_STALE_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - updatedAt) >= staleMs;
}

// This function picks the nearest active taxonomy display name for an island vector.
export function resolveTaxonomyDisplayName(vector, taxonomyRows = []) {
  if (!Array.isArray(vector) || !vector.length) return null;

  let bestName = null;
  let bestSimilarity = -1;

  for (const row of taxonomyRows) {
    const similarity = cosineSimilarity(vector, row.vector);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestName = row.displayName;
    }
  }

  return bestName || null;
}

// This function derives a fallback island label from the strongest topic names.
export function resolveTopicFallbackLabel(profile) {
  const names = (profile?.topics || [])
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  if (!names.length) return null;
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}
