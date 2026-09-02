import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchArticles } = vi.hoisted(() => ({ searchArticles: vi.fn() }));

vi.mock('../../services/articleSearch/articleSearch.service.js', () => ({
  searchArticles
}));

import {
  executeGeneratedFeedExpression,
  GENERATED_FEED_CANDIDATE_LIMIT,
  GENERATED_FEED_RESULT_LIMIT
} from '../../services/generatedFeeds/generatedFeedExecution.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Generated Feed expression execution', () => {
  it('delegates to the shared search engine with owner scope and hard ceilings', async () => {
    const searchResult = { itemIds: ['9', '4'], total: 2 };
    searchArticles.mockResolvedValue(searchResult);

    await expect(executeGeneratedFeedExpression({
      userId: 27,
      expression: 'tag:security sort:quality limit:5000'
    })).resolves.toBe(searchResult);

    expect(searchArticles).toHaveBeenCalledWith({
      userId: 27,
      search: 'tag:security sort:quality limit:5000',
      minAdvertisementScore: 0,
      minSentimentScore: 0,
      minQualityScore: 0,
      status: '%',
      executionBounds: {
        maxResults: GENERATED_FEED_RESULT_LIMIT,
        maxCandidates: GENERATED_FEED_CANDIDATE_LIMIT
      }
    });
    expect(GENERATED_FEED_RESULT_LIMIT).toBe(50);
    expect(GENERATED_FEED_CANDIDATE_LIMIT).toBe(500);
  });

  it('preserves shared-search failures for the RSS controller to handle', async () => {
    const error = new Error('search failed');
    searchArticles.mockRejectedValue(error);

    await expect(executeGeneratedFeedExpression({
      userId: 27,
      expression: 'unread:true'
    })).rejects.toBe(error);
  });
});
