import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  islandFindAll: vi.fn(),
  query: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Island: { findAll: mocks.islandFindAll },
    sequelize: {
      query: mocks.query,
      fn: vi.fn(),
      col: vi.fn()
    },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } }
  }
}));

import { disambiguateDuplicateIslandNamesForUser } from '../../services/islands/islandNameDisambiguation.js';

// This function builds an island double whose update method reflects persisted changes.
function island(overrides = {}) {
  const instance = {
    id: 1,
    label: 'Technology',
    embedding_model: 'test-model', islandVector: [1, 0],
    weight: 0.5,
    populationAudit: [],
    ...overrides
  };
  instance.update = vi.fn(async values => Object.assign(instance, values));
  return instance;
}

describe('duplicate island name persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('renames both near duplicates and semantically distinct Islands without archival', async () => {
    const strongest = island({ id: 1, islandVector: [1, 0], weight: 0.8, populationAudit: [{ metrics: { relatedArticleCount: 2 } }] });
    const duplicate = island({ id: 2, islandVector: [0.999, 0.001] });
    const distinct = island({ id: 3, islandVector: [0, 1], populationAudit: [{ sourceArticles: { articles: [{ title: 'Quantum Cameras' }] } }] });
    mocks.islandFindAll.mockResolvedValue([strongest, duplicate, distinct]);

    const result = await disambiguateDuplicateIslandNamesForUser(8, { transaction: 'tx' });

    expect(mocks.islandFindAll).toHaveBeenCalledWith({ where: { userId: 8 }, order: [['id', 'ASC']], transaction: 'tx' });
    expect(strongest.update).not.toHaveBeenCalled();
    expect(duplicate.update).toHaveBeenCalledExactlyOnceWith({ label: 'Technology: Variant' }, { transaction: 'tx' });
    expect(distinct.update).toHaveBeenCalledWith({ label: 'Technology: Quantum Cameras' }, { transaction: 'tx' });
    expect(result.archived).toEqual([]);
    expect(result.renamed).toEqual([expect.objectContaining({
      islandId: 3,
      strongerIslandId: 1,
      to: 'Technology: Quantum Cameras'
    }), expect.objectContaining({ islandId: 2, to: 'Technology: Variant' })]);
  });

  it('returns an empty summary without relationship queries when there are no owned islands', async () => {
    mocks.islandFindAll.mockResolvedValue([]);

    await expect(disambiguateDuplicateIslandNamesForUser(8)).resolves.toEqual({ renamed: [], archived: [] });
    expect(mocks.query).not.toHaveBeenCalled();

  });
});
