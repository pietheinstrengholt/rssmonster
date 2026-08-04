import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  islandFindAll: vi.fn(),
  islandCreate: vi.fn(),
  islandTopicFindAll: vi.fn(),
  islandTopicBulkCreate: vi.fn(),
  taxonomyFindAll: vi.fn(),
  buildAudit: vi.fn(),
  evolveMemberships: vi.fn(),
  disambiguate: vi.fn(),
  debugIsland: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Island: { findAll: mocks.islandFindAll, create: mocks.islandCreate },
    IslandTopic: { findAll: mocks.islandTopicFindAll, bulkCreate: mocks.islandTopicBulkCreate },
    IslandTaxonomy: { findAll: mocks.taxonomyFindAll },
    sequelize: { fn: vi.fn(), col: vi.fn() }
  }
}));

vi.mock('../../services/islands/islandAudit.js', () => ({
  buildPopulationAuditEntry: mocks.buildAudit,
  appendPopulationAudit: (existing, entry) => [...(Array.isArray(existing) ? existing : []), entry]
}));

vi.mock('../../services/islands/islandMemberships.js', () => ({
  evolveIslandTopicMemberships: mocks.evolveMemberships
}));

vi.mock('../../services/islands/islandNameDisambiguation.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    disambiguateDuplicateIslandNamesForUser: mocks.disambiguate
  };
});

vi.mock('../../services/islands/islandVectorUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ISLAND_DEBUG: true,
    debugIsland: mocks.debugIsland
  };
});

import { persistInterestIslandProfiles } from '../../services/islands/islandPersistence.js';

// This function builds an existing island double that applies updates like a Sequelize instance.
function existingIsland(overrides = {}) {
  const island = {
    id: 9,
    label: 'Existing',
    weight: 0.4,
    islandVector: [1, 0],
    positiveSignals: {},
    populationAudit: [],
    archivedInd: false,
    updatedAt: new Date(),
    ...overrides
  };
  island.update = vi.fn(async (values) => Object.assign(island, values));
  return island;
}

describe('island profile persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taxonomyFindAll.mockResolvedValue([]);
    mocks.buildAudit.mockResolvedValue({ audit: true });
    mocks.disambiguate.mockResolvedValue({ renamed: [], archived: [] });
  });

  it('updates a semantic match, merges signals, and evolves topic memberships', async () => {
    const island = existingIsland({ positiveSignals: { stars: 1 } });
    mocks.islandFindAll.mockResolvedValue([island]);
    mocks.islandTopicFindAll.mockResolvedValue([]);
    mocks.evolveMemberships.mockResolvedValue({ totalMembershipCount: 1, newMembershipCount: 1, removedMembershipCount: 0 });

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.8,
      label: 'Updated',
      topics: [{ topicId: 4, name: 'AI', vector: [1, 0], strength: 0.9 }],
      articles: [{ articleId: 5, score: 4 }],
      positiveSignals: { positives: 1, stars: 2, clicks: 1, negatives: 1 }
    }], 'tx');

    expect(island.update).toHaveBeenCalledWith(expect.objectContaining({
      label: 'AI',
      weight: 0.8,
      positiveSignals: expect.objectContaining({ positives: 1, stars: 3, clicks: 1, negatives: 1 })
    }), { transaction: 'tx' });
    expect(mocks.evolveMemberships).toHaveBeenCalledWith(9, [
      { topicId: 4, similarity: 1, confidence: 0.9 }
    ], 'tx');
    expect(result.summary).toMatchObject({ updatedIslandCount: 1, createdIslandCount: 0, totalMembershipCount: 1 });
  });

  it('creates a unique island and archives an unmatched stale low-confidence island', async () => {
    const stale = existingIsland({
      id: 2,
      label: 'AI',
      islandVector: [0, 1],
      updatedAt: new Date('2000-01-01T00:00:00.000Z')
    });
    const created = existingIsland({ id: 10, label: 'AI (2)', islandVector: [1, 0] });
    mocks.islandFindAll.mockResolvedValue([stale]);
    mocks.islandCreate.mockResolvedValue(created);
    mocks.islandTopicFindAll.mockResolvedValue([{ islandId: 2, avgConfidence: 0.01 }]);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.7,
      label: 'AI',
      topics: [{ topicId: 7, name: 'AI', vector: [1, 0], strength: 0.8 }],
      articles: [],
      positiveSignals: { stars: 1 }
    }], 'tx');

    expect(mocks.islandCreate).toHaveBeenCalledWith(expect.objectContaining({ label: 'AI (2)', userId: 3 }), { transaction: 'tx' });
    expect(mocks.islandTopicBulkCreate).toHaveBeenCalledWith([
      { islandId: 10, topicId: 7, similarity: 1, confidence: 0.8 }
    ], { transaction: 'tx' });
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ archivedInd: true }), { transaction: 'tx' });
    expect(result.summary).toMatchObject({ createdIslandCount: 1, archivedIslandCount: 1, newMembershipCount: 1 });
  });

  it('ignores profiles without vectors or qualifying evidence', async () => {
    mocks.islandFindAll.mockResolvedValue([]);

    const result = await persistInterestIslandProfiles(3, [
      { vector: null, topics: [{ strength: 1 }] },
      { vector: [1, 0], topics: [{ strength: 0.01 }], articles: [] }
    ], 'tx');

    expect(mocks.islandCreate).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('updates a semantic match from article-only behavioral evidence', async () => {
    const island = existingIsland();
    mocks.islandFindAll.mockResolvedValue([island]);
    mocks.islandTopicFindAll.mockResolvedValue([]);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.6,
      label: 'Behavioral',
      topics: [],
      articles: [{
        articleId: 8,
        score: 3,
        positiveSignals: { deepReads: 1 }
      }],
      positiveSignals: { deepReads: 1 }
    }], 'tx');

    expect(island.update).toHaveBeenCalled();
    expect(mocks.evolveMemberships).not.toHaveBeenCalled();
    expect(result.summary.updatedIslandCount).toBe(1);
  });

  it('creates an article-only island without topic memberships', async () => {
    const created = existingIsland({ id: 11, label: 'Behavioral' });
    mocks.islandFindAll.mockResolvedValue([]);
    mocks.islandCreate.mockResolvedValue(created);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.5,
      label: 'Behavioral',
      topics: [],
      articles: [{ articleId: 12, score: 2 }],
      positiveSignals: { clicks: 1 }
    }], 'tx');

    expect(mocks.islandTopicBulkCreate).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      createdIslandCount: 1,
      totalMembershipCount: 0
    });
  });

  it('describes each article engagement signal while updating distinct islands', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const signals = [
      { stars: 1 },
      { positives: 1 },
      { clicks: 1 },
      { negatives: 1 },
      {}
    ];
    const islands = signals.map((_signal, index) => existingIsland({
      id: 20 + index,
      islandVector: signals.map((_value, vectorIndex) => vectorIndex === index ? 1 : 0)
    }));
    mocks.islandFindAll.mockResolvedValue(islands);
    mocks.islandTopicFindAll.mockResolvedValue([]);

    const profiles = signals.map((positiveSignals, index) => ({
      vector: signals.map((_value, vectorIndex) => vectorIndex === index ? 1 : 0),
      weight: 0.5,
      label: `Behavior ${index}`,
      topics: [],
      articles: [{ articleId: 100 + index, score: 1, positiveSignals }],
      positiveSignals
    }));

    const result = await persistInterestIslandProfiles(3, profiles, 'tx');

    expect(result.summary.updatedIslandCount).toBe(5);
    expect(consoleLog.mock.calls.map(([message]) => message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('engagement=star'),
        expect.stringContaining('engagement=positive'),
        expect.stringContaining('engagement=click'),
        expect.stringContaining('engagement=negative'),
        expect.stringContaining('engagement=behavior')
      ])
    );
  });
});
