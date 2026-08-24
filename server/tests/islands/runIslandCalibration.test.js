import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindAll: vi.fn(),
  islandFindAll: vi.fn(),
  islandCount: vi.fn(),
  taxonomyFindAll: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  buildArticles: vi.fn(),
  buildTopics: vi.fn(),
  buildAudit: vi.fn(),
  evolveMemberships: vi.fn(),
  persist: vi.fn(),
  score: vi.fn(),
  recordProcessingFailure: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    User: { findAll: mocks.userFindAll },
    Island: { findAll: mocks.islandFindAll, count: mocks.islandCount },
    IslandTaxonomy: { findAll: mocks.taxonomyFindAll },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    sequelize: {
      transaction: mocks.transaction,
      query: mocks.query
    }
  }
}));

vi.mock('../../services/score/scoreArticlesFromIslands.js', () => ({ default: mocks.score }));
vi.mock('../../services/islands/islandArticleProfiles.js', () => ({
  buildInterestIslandProfilesForUser: mocks.buildArticles
}));
vi.mock('../../services/islands/islandTopicProfiles.js', () => ({
  buildTopicInterestIslandProfilesForUser: mocks.buildTopics
}));
vi.mock('../../services/islands/islandAudit.js', () => ({
  buildPopulationAuditEntry: mocks.buildAudit,
  appendPopulationAudit: (existing, entry) => [...(existing || []), entry]
}));
vi.mock('../../services/islands/islandMemberships.js', () => ({
  evolveIslandTopicMemberships: mocks.evolveMemberships
}));
vi.mock('../../services/islands/islandPersistence.js', () => ({
  persistInterestIslandProfiles: mocks.persist
}));
vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocks.recordProcessingFailure
}));

import {
  calibrateIslandsFromBehavior,
  enrichIslandsFromTopics,
  enrichIslandsFromTopicsForUser,
  persistIslandProfilesForUser,
  runIslandCalibration,
  runIslandCalibrationForUser
} from '../../services/islands/runIslandCalibration.js';

describe('island calibration orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async callback => callback('tx'));
    mocks.userFindAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mocks.islandFindAll.mockResolvedValue([]);
    mocks.islandCount.mockResolvedValue(1);
    mocks.taxonomyFindAll.mockResolvedValue([]);
    mocks.query.mockResolvedValue([]);
    mocks.buildArticles.mockResolvedValue([]);
    mocks.buildTopics.mockResolvedValue([]);
    mocks.buildAudit.mockResolvedValue({ audit: true });
    mocks.evolveMemberships.mockResolvedValue({ newMembershipCount: 0, removedMembershipCount: 0 });
    mocks.persist.mockResolvedValue([]);
    mocks.score.mockResolvedValue({ topicScoredCount: 0, fallbackScoredCount: 0, updatedCount: 0 });
    mocks.recordProcessingFailure.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('summarizes persisted profile article counts and attached persistence metadata', async () => {
    const islands = [{ id: 4 }];
    islands.summary = { createdIslandCount: 1 };
    mocks.persist.mockResolvedValue(islands);
    const profiles = [{ articles: [{}, {}] }, { topics: [] }];

    await expect(persistIslandProfilesForUser(7, profiles, { maxIslands: 2 })).resolves.toEqual({
      userId: 7,
      islandCount: 1,
      articleCount: 2,
      persistenceSummary: { createdIslandCount: 1 },
      profiles
    });
    expect(mocks.persist).toHaveBeenCalledWith(7, profiles, 'tx', { maxIslands: 2 });
  });

  it('deduplicates qualifying topic candidates and refreshes the island audit and label', async () => {
    const island = {
      id: 5,
      label: 'Old',
      weight: 1,
      islandVector: [1, 0],
      populationAudit: [],
      update: vi.fn()
    };
    mocks.islandFindAll.mockResolvedValue([island]);
    mocks.taxonomyFindAll.mockResolvedValue([{ displayName: 'Artificial Intelligence', vector: [1, 0] }]);
    mocks.buildTopics.mockResolvedValue([
      { topics: [{ topicId: 11, name: 'AI', vector: [1, 0], strength: 0.4, evidenceCount: 1 }] },
      { topics: [{ topicId: 11, name: 'AI duplicate', vector: [1, 0], strength: 0.9, evidenceCount: 5 }] },
      { topics: [{ topicId: 12, name: 'Invalid', vector: null, strength: 1 }] }
    ]);
    mocks.evolveMemberships.mockResolvedValue({ newMembershipCount: 1, removedMembershipCount: 2 });

    const result = await enrichIslandsFromTopicsForUser(7, { topicConfidenceThreshold: 0.1 });

    expect(mocks.evolveMemberships).toHaveBeenCalledWith(5, [
      { topicId: 11, similarity: 1, confidence: 1 }
    ], 'tx');
    expect(island.update).toHaveBeenCalledWith({
      label: 'Artificial Intelligence',
      populationAudit: [{ audit: true }]
    }, { transaction: 'tx' });
    expect(result).toEqual({
      userId: 7,
      enrichedIslandCount: 1,
      islandTopicLinkCount: 1,
      enrichmentNewMembershipCount: 1,
      enrichmentRemovedMembershipCount: 2
    });
  });

  it('continues bulk behavior calibration after one user fails', async () => {
    mocks.buildArticles.mockImplementation(async userId => {
      if (userId === 2) throw new Error('profile failure');
      return [{ articles: [{ articleId: 9 }] }];
    });

    const result = await calibrateIslandsFromBehavior({ maxIslands: 3 });

    expect(result.userCount).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(mocks.recordProcessingFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      stage: 'island_calibration',
      severity: 'FATAL'
    }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 2'), expect.any(Error));
  });

  it('continues bulk topic enrichment after one user fails', async () => {
    mocks.buildTopics.mockImplementation(async userId => {
      if (userId === 2) throw new Error('topic failure');
      return [];
    });

    const result = await enrichIslandsFromTopics({ maxIslands: 3 });

    expect(result.userCount).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(mocks.recordProcessingFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      stage: 'island_enrichment',
      severity: 'FATAL'
    }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 2'), expect.any(Error));
  });

  it('runs behavior, enrichment, scoring, and summary reporting for one user', async () => {
    const islands = [{ id: 1 }];
    islands.summary = { existingIslandCount: 2 };
    mocks.buildArticles.mockResolvedValue([{ articles: [{ articleId: 3 }] }]);
    mocks.persist.mockResolvedValue(islands);
    mocks.score.mockResolvedValue({ topicScoredCount: 4, fallbackScoredCount: 2, updatedCount: 6 });
    mocks.query
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ topicCount: 3 }]);

    const result = await runIslandCalibrationForUser(7);

    expect(result).toMatchObject({
      userId: 7,
      islandCount: 1,
      articleCount: 1,
      topicScoredCount: 4,
      fallbackScoredCount: 2,
      rescoredArticleCount: 6
    });
    expect(mocks.islandCount).toHaveBeenCalled();
  });

  it('continues full calibration after one user fails', async () => {
    mocks.buildArticles.mockImplementation(async userId => {
      if (userId === 2) throw new Error('calibration failure');
      return [];
    });

    const result = await runIslandCalibration();

    expect(result.userCount).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 2'), expect.any(Error));
  });
});
