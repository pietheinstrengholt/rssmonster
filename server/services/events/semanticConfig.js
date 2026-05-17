export const SEMANTIC_GRANULARITY = {
  eventSimilarityThreshold: 0.88,
  topicSimilarityThreshold: 0.65,
  maxCandidates: 300,
  recencyWindowDays: Number.parseInt(process.env.RECENCY_WINDOW_DAYS, 10) || 7,
  eventStrength: {
    maxArticleRedundancyCount: 3,
    maxTopicEventLogBase: 3,
    cohesionBaseline: 0.85,
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
export const EVENT_STRENGTH_CONFIG = SEMANTIC_GRANULARITY.eventStrength;
