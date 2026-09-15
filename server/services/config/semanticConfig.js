// Defines the semantic granularity enforced by this service.
export const SEMANTIC_GRANULARITY = {
  // Minimum cosine similarity for attaching an article to an existing event.
  // Higher value = stricter event matching (fewer merges, more fragmentation).
  eventSimilarityThreshold: Number.parseFloat(process.env.EVENT_SIM_THRESHOLD || '0.84'),

  // Max in-memory candidates scanned when searching events.
  maxCandidates: 300,

  // Replay/incremental clustering window (days of content considered).
  recencyWindowDays: Number.parseInt(process.env.RECENCY_WINDOW_DAYS, 10) || 7,

  // Hard event-time window for event continuity; beyond this, articles form another event.
  maxEventGapHours: Number.parseInt(process.env.EVENT_MAX_GAP_HOURS, 10) || 48,

  // Time decay half-life used for event recency weighting.
  // Lower value makes older events lose match strength faster.
  eventRecencyHalfLifeHours: Number.parseInt(process.env.EVENT_RECENCY_HALF_LIFE_HOURS, 10) || 18,

  // Minimum headline token overlap score used as an auxiliary corroboration signal.
  // This does not replace semantic similarity; it supports it.
  minHeadlineSimilarity: Number.parseFloat(process.env.EVENT_MIN_HEADLINE_SIM || '0.22'),

  // Minimum named-entity overlap count (title/description heuristic) used as auxiliary corroboration.
  minSharedEntityOverlap: Number.parseInt(process.env.EVENT_MIN_SHARED_ENTITY_OVERLAP, 10) || 1,

  // Lifecycle cutoffs controlling event state transitions based on age and size.
  eventLifecycle: {
    // Event with <= this many articles is considered emerging while still fresh.
    emergingArticleMax: Number.parseInt(process.env.EVENT_EMERGING_ARTICLE_MAX, 10) || 2,

    // If eventWindowEndAt is older than this, event leaves active and becomes cooling.
    activeFreshHours: Number.parseInt(process.env.EVENT_ACTIVE_FRESH_HOURS, 10) || 24,

    // If eventWindowEndAt is older than this, event is archived.
    coolingHours: Number.parseInt(process.env.EVENT_COOLING_HOURS, 10) || 96
  },

  // Final eventStrength score configuration (0..1).
  // This score is used for ranking/importance, not for initial event existence checks.
  eventStrength: {
    // Article count at/above this reaches full redundancy contribution.
    maxArticleRedundancyCount: 3,

    // Baseline semantic cohesion contribution applied to all events.
    cohesionBaseline: 0.85,

    // Preserve the existing minimum strength while using occurrence evidence only.
    baseline: 0.20 / 3,
    weights: {
      redundancy: 0.45,
      cohesion: 0.35,
    }
  }
};

// Defines the event sim threshold enforced by this service.
export const EVENT_SIM_THRESHOLD = SEMANTIC_GRANULARITY.eventSimilarityThreshold;
// Defines the max candidates enforced by this service.
export const MAX_CANDIDATES = SEMANTIC_GRANULARITY.maxCandidates;
// Defines the recency window days enforced by this service.
export const RECENCY_WINDOW_DAYS = SEMANTIC_GRANULARITY.recencyWindowDays;
// Defines the event max gap hours enforced by this service.
export const EVENT_MAX_GAP_HOURS = SEMANTIC_GRANULARITY.maxEventGapHours;
// Defines the event recency half life hours enforced by this service.
export const EVENT_RECENCY_HALF_LIFE_HOURS = SEMANTIC_GRANULARITY.eventRecencyHalfLifeHours;
// Defines the event min headline sim enforced by this service.
export const EVENT_MIN_HEADLINE_SIM = SEMANTIC_GRANULARITY.minHeadlineSimilarity;
// Defines the event min shared entity overlap enforced by this service.
export const EVENT_MIN_SHARED_ENTITY_OVERLAP = SEMANTIC_GRANULARITY.minSharedEntityOverlap;
// Defines the event lifecycle enforced by this service.
export const EVENT_LIFECYCLE = SEMANTIC_GRANULARITY.eventLifecycle;
// Defines the event strength config enforced by this service.
export const EVENT_STRENGTH_CONFIG = SEMANTIC_GRANULARITY.eventStrength;

// Minimum undecayed evidence advantage, initially the size of the existing entity bonus.
// This is a conservative ambiguity rule, not a calibrated probability threshold.
const configuredWinnerMargin = Number.parseFloat(process.env.EVENT_MIN_WINNER_MARGIN ?? '0.03');
export const EVENT_MIN_WINNER_MARGIN = Number.isFinite(configuredWinnerMargin) && configuredWinnerMargin >= 0
  ? configuredWinnerMargin
  : 0.03;

// Defines the min event articles enforced by this service.
export const MIN_EVENT_ARTICLES = Number.parseInt(process.env.MIN_EVENT_ARTICLES || '2', 10);
// Defines the min event sources enforced by this service.
export const MIN_EVENT_SOURCES = Number.parseInt(process.env.MIN_EVENT_SOURCES || '2', 10);
// Defines the require multi source for event enforced by this service.
export const REQUIRE_MULTI_SOURCE_FOR_EVENT = ['1', 'true', 'yes'].includes(
  String(process.env.REQUIRE_MULTI_SOURCE_FOR_EVENT || 'false').toLowerCase()
);
