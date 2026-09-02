import { searchArticles } from '../articleSearch/articleSearch.service.js';

export const GENERATED_FEED_RESULT_LIMIT = 50;
export const GENERATED_FEED_CANDIDATE_LIMIT = 500;

// Executes one persisted expression through the shared search engine with public-feed ceilings.
export const executeGeneratedFeedExpression = ({ userId, expression }) =>
  searchArticles({
    userId,
    search: expression,
    minAdvertisementScore: 0,
    minSentimentScore: 0,
    minQualityScore: 0,
    status: '%',
    executionBounds: {
      maxResults: GENERATED_FEED_RESULT_LIMIT,
      maxCandidates: GENERATED_FEED_CANDIDATE_LIMIT
    }
  });
