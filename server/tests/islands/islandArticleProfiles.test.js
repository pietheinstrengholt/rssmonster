import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: { Article: { findAll: mocks.findAll } }
}));

import {
  buildInterestIslandProfilesForUser,
  computeArticleSignals
} from '../../services/islands/islandArticleProfiles.js';

describe('behavioral article island profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps clicks and combines positive, deep-read, and negative signals', () => {
    const result = computeArticleSignals({
      positiveInd: 1,
      favoriteInd: 1,
      clickedAmount: 8,
      attentionBucket: 3,
      negativeInd: 1,
      publishedAt: new Date(Date.now() + 60_000)
    });

    expect(result).toEqual({
      positiveScore: 15.5,
      negativeScore: 4,
      engagementScore: 15.5,
      positiveSignals: { positives: 1, stars: 1, clicks: 3, deepReads: 1, negatives: 1 }
    });
  });

  it('filters unusable evidence and clusters similar articles with deterministic labels', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 1, title: 'Primary', articleVector: [1, 0], positiveInd: 1, publishedAt: new Date(Date.now() + 60_000) },
      { id: 2, title: 'Related', articleVector: [0.99, 0.01], favoriteInd: 1, publishedAt: new Date(Date.now() + 60_000) },
      { id: 3, title: 'Different', articleVector: [0, 1], clickedAmount: 1, publishedAt: new Date(Date.now() + 60_000) },
      { id: 4, title: 'No vector', articleVector: null, positiveInd: 1 },
      { id: 5, title: 'No signal', articleVector: [1, 0] }
    ]);

    const profiles = await buildInterestIslandProfilesForUser(12, { maxIslands: 1 });

    expect(mocks.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 12 }) }));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].articles.map(article => article.articleId)).toEqual([1, 2, 3]);
    expect(profiles[0].label).toBe('Primary');
    expect(profiles[0].positiveSignals).toEqual({ positives: 1, stars: 1, clicks: 1, deepReads: 0, negatives: 0 });
  });
});
