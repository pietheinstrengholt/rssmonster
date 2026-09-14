import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  islandFindAll: vi.fn(),
  islandCreate: vi.fn(),
  taxonomyFindAll: vi.fn(),
  buildAudit: vi.fn(),
  loadEvidence: vi.fn(),
  disambiguate: vi.fn(),
  debugIsland: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Island: { findAll: mocks.islandFindAll, create: mocks.islandCreate },
    IslandTaxonomy: { findAll: mocks.taxonomyFindAll },
    sequelize: { fn: vi.fn(), col: vi.fn() }
  }
}));

vi.mock('../../services/islands/islandInterestConfidence.js', () => ({ loadIslandEvidence: mocks.loadEvidence }));

vi.mock('../../services/islands/islandAudit.js', () => ({
  buildPopulationAuditEntry: mocks.buildAudit,
  appendPopulationAudit: (existing, entry) => [...(Array.isArray(existing) ? existing : []), entry]
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
    mocks.loadEvidence.mockResolvedValue({ islands: [{ id: 2, islandConfidence: 0.01 }] });
    mocks.taxonomyFindAll.mockResolvedValue([]);
    mocks.buildAudit.mockResolvedValue({ audit: true });
    mocks.disambiguate.mockResolvedValue({ renamed: [], archived: [] });
  });

  it('updates a semantic match with snapshot signals from behavioral evidence', async () => {
    const island = existingIsland({ positiveSignals: { stars: 1 } });
    mocks.islandFindAll.mockResolvedValue([island]);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.8,
      label: 'Updated',
      articles: [{ articleId: 5, score: 4 }],
      positiveSignals: { positives: 1, stars: 2, clicks: 1, negatives: 1 }
    }], 'tx');

    expect(island.update).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Updated',
      weight: 0.8,
      positiveSignals: expect.objectContaining({ positives: 1, stars: 2, clicks: 1, negatives: 1 })
    }), { transaction: 'tx' });
    expect(result.summary).toMatchObject({
      updatedIslandCount: 1,
      createdIslandCount: 0,
      createdIslandIds: [],
    });
  });

  it('replaying full profiles preserves counters while genuine new clicks are reflected', async () => {
    const island = existingIsland();
    mocks.islandFindAll.mockResolvedValue([island]);

    const profile = { vector: [1, 0], weight: 0.6, label: 'Local AI', articles: [{ articleId: 8, score: 6 }], positiveSignals: { stars: 1, clicks: 1 } };
    await persistInterestIslandProfiles(3, [profile], 'tx');
    const first = structuredClone(island.positiveSignals);
    await persistInterestIslandProfiles(3, [profile], 'tx');
    await persistInterestIslandProfiles(3, [profile], 'tx');
    expect(island.positiveSignals).toEqual(first);
    expect(island.positiveSignals).toMatchObject({ stars: 1, clicks: 1 });
    await persistInterestIslandProfiles(3, [{ ...profile, positiveSignals: { stars: 1, clicks: 2 } }], 'tx');
    expect(island.positiveSignals).toMatchObject({ stars: 1, clicks: 2 });
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

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.7,
      label: 'AI',
      articles: [{ articleId: 1, score: 1 }],
      positiveSignals: { stars: 1 }
    }], 'tx');

    expect(mocks.islandCreate).toHaveBeenCalledWith(expect.objectContaining({ label: 'AI (2)', userId: 3 }), { transaction: 'tx' });

    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ archivedInd: true }), { transaction: 'tx' });
    expect(result.summary).toMatchObject({
      createdIslandCount: 1,
      createdIslandIds: [created.id],
      archivedIslandCount: 1,
    });
  });

  it('ignores profiles without vectors or qualifying evidence', async () => {
    mocks.islandFindAll.mockResolvedValue([]);

    const result = await persistInterestIslandProfiles(3, [
      { vector: null },
      { vector: [1, 0], articles: [] }
    ], 'tx');

    expect(mocks.islandCreate).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('updates a semantic match from article-only behavioral evidence', async () => {
    const island = existingIsland();
    mocks.islandFindAll.mockResolvedValue([island]);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.6,
      label: 'Behavioral',
      articles: [{
        articleId: 8,
        score: 3,
        positiveSignals: { deepReads: 1 }
      }],
      positiveSignals: { deepReads: 1 }
    }], 'tx');

    expect(island.update).toHaveBeenCalled();
    expect(result.summary.updatedIslandCount).toBe(1);
  });

  it('creates an article-only island from behavioral evidence', async () => {
    const created = existingIsland({ id: 11, label: 'Behavioral' });
    mocks.islandFindAll.mockResolvedValue([]);
    mocks.islandCreate.mockResolvedValue(created);

    const result = await persistInterestIslandProfiles(3, [{
      vector: [1, 0],
      weight: 0.5,
      label: 'Behavioral',
      articles: [{ articleId: 12, score: 2 }],
      positiveSignals: { clicks: 1 }
    }], 'tx');

    expect(result.summary).toMatchObject({
      createdIslandCount: 1,
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

    const profiles = signals.map((positiveSignals, index) => ({
      vector: signals.map((_value, vectorIndex) => vectorIndex === index ? 1 : 0),
      weight: 0.5,
      label: `Behavior ${index}`,
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
