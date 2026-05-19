export const SEMANTIC_GRANULARITY = {
  // Minimum cosine similarity for attaching an article to an existing event.
  // Higher value = stricter event matching (fewer merges, more fragmentation).
  eventSimilarityThreshold: Number.parseFloat(process.env.EVENT_SIM_THRESHOLD || '0.86'),

  // Minimum cosine similarity for attaching an article/event to an existing topic.
  // Topics should be broader than events, so this is usually lower than eventSimilarityThreshold.
  topicSimilarityThreshold: Number.parseFloat(process.env.TOPIC_SIM_THRESHOLD || '0.72'),

  // Max in-memory candidates scanned when searching events/topics.
  maxCandidates: 300,

  // Replay/incremental clustering window (days of content considered).
  recencyWindowDays: Number.parseInt(process.env.RECENCY_WINDOW_DAYS, 10) || 7,

  // Hard time gap limit for event continuity; beyond this, temporal score becomes 0.
  maxEventGapHours: Number.parseInt(process.env.EVENT_MAX_GAP_HOURS, 10) || 72,

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

    // If lastSeen is older than this, event leaves active and becomes cooling.
    activeFreshHours: Number.parseInt(process.env.EVENT_ACTIVE_FRESH_HOURS, 10) || 24,

    // If lastSeen is older than this, event is archived.
    coolingHours: Number.parseInt(process.env.EVENT_COOLING_HOURS, 10) || 96
  },

  // Topic vector blend factor for updates.
  // Lower alpha = slower topic drift (more stable long-term memory).
  topicUpdate: {
    vectorAlpha: Number.parseFloat(process.env.TOPIC_VECTOR_ALPHA || '0.08')
  },

  // Event vector blend factor for updates.
  // Higher alpha = faster adaptation to new event evidence.
  eventUpdate: {
    vectorAlpha: Number.parseFloat(process.env.EVENT_VECTOR_ALPHA || '0.45')
  },

  // Final eventStrength score configuration (0..1).
  // This score is used for ranking/importance, not for initial event existence checks.
  eventStrength: {
    // Article count at/above this reaches full redundancy contribution.
    maxArticleRedundancyCount: 3,

    // Normalization base for topic density contribution (log-scaled event count per topic).
    maxTopicEventLogBase: 3,

    // Baseline semantic cohesion contribution applied to all events.
    cohesionBaseline: 0.85,

    // Weighted blend for eventStrength = redundancy*w1 + cohesion*w2 + topic*w3.
    weights: {
      redundancy: 0.45,
      cohesion: 0.35,
      topic: 0.20
    }
  }
};

export const EVENT_SIM_THRESHOLD = SEMANTIC_GRANULARITY.eventSimilarityThreshold;
export const TOPIC_SIM_THRESHOLD = SEMANTIC_GRANULARITY.topicSimilarityThreshold;
export const MAX_CANDIDATES = SEMANTIC_GRANULARITY.maxCandidates;
export const RECENCY_WINDOW_DAYS = SEMANTIC_GRANULARITY.recencyWindowDays;
export const EVENT_MAX_GAP_HOURS = SEMANTIC_GRANULARITY.maxEventGapHours;
export const EVENT_RECENCY_HALF_LIFE_HOURS = SEMANTIC_GRANULARITY.eventRecencyHalfLifeHours;
export const EVENT_MIN_HEADLINE_SIM = SEMANTIC_GRANULARITY.minHeadlineSimilarity;
export const EVENT_MIN_SHARED_ENTITY_OVERLAP = SEMANTIC_GRANULARITY.minSharedEntityOverlap;
export const EVENT_LIFECYCLE = SEMANTIC_GRANULARITY.eventLifecycle;
export const TOPIC_VECTOR_ALPHA = SEMANTIC_GRANULARITY.topicUpdate.vectorAlpha;
export const EVENT_VECTOR_ALPHA = SEMANTIC_GRANULARITY.eventUpdate.vectorAlpha;
export const EVENT_STRENGTH_CONFIG = SEMANTIC_GRANULARITY.eventStrength;
