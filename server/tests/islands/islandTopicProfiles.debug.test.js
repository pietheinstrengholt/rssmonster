import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';

const mocks = vi.hoisted(() => ({
  debugIsland: vi.fn()
}));

vi.mock('../../services/islands/islandVectorUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ISLAND_DEBUG: true,
    debugIsland: mocks.debugIsland
  };
});

const { buildTopicInterestIslandProfilesForUser } = await import(
  '../../services/islands/islandTopicProfiles.js'
);

// This function creates a topic shape with the engagement fields used for behavioral clustering.
function topicProfile(id, name, articleId, overrides = {}) {
  return {
    id,
    name,
    topicVector: [id === 1 ? 1 : 0, id === 2 ? 1 : 0, 0.5],
    affinityScore: 0.5,
    eventCount: 1,
    articleCount: 1,
    articles: [{
      id: articleId,
      positiveInd: 1,
      favoriteInd: 0,
      clickedAmount: 1,
      attentionBucket: 0,
      negativeInd: 0,
      publishedAt: new Date('2026-07-01T10:00:00.000Z')
    }],
    ...overrides
  };
}

describe('island topic profile diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.debugIsland.mockReset();
  });

  it('reports affinity pairs and final communities when diagnostics are enabled', async () => {
    const photography = topicProfile(3, 'Photography', 300);
    photography.articles[0].publishedAt = new Date('2026-07-10T10:00:00.000Z');
    const travel = topicProfile(4, 'Travel', 400);
    travel.articles[0].publishedAt = new Date('2026-07-20T10:00:00.000Z');
    vi.spyOn(db.Topic, 'findAll').mockResolvedValue([
      topicProfile(1, 'AI', 100),
      topicProfile(2, 'Linux', 100),
      photography,
      travel
    ]);

    const communities = await buildTopicInterestIslandProfilesForUser(42, { maxIslands: 2 });

    expect(communities).toHaveLength(2);
    expect(mocks.debugIsland).toHaveBeenCalledWith(
      'behavioral-community-formation',
      expect.objectContaining({
        userId: 42,
        topicCount: 4,
        maxIslands: 2,
        topAffinityPairs: expect.arrayContaining([
          expect.objectContaining({ topicAId: 1, topicBId: 2, affinity: 1 })
        ]),
        finalCommunities: expect.any(Array)
      })
    );
  });

  it('uses the generic island label when topic names are absent', async () => {
    vi.spyOn(db.Topic, 'findAll').mockResolvedValue([
      topicProfile(10, null, 500, { topicVector: null, articles: [] })
    ]);

    const communities = await buildTopicInterestIslandProfilesForUser(43);

    expect(communities[0].label).toBe('Interest Island');
    expect(communities[0].vector).toBeNull();
  });
});
