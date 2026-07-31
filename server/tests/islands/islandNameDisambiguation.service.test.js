import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  islandFindAll: vi.fn(),
  islandTopicFindAll: vi.fn(),
  query: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Island: { findAll: mocks.islandFindAll },
    IslandTopic: { findAll: mocks.islandTopicFindAll },
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
    islandVector: [1, 0],
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

  it('archives near duplicates and renames semantically distinct weaker islands', async () => {
    const strongest = island({ id: 1, islandVector: [1, 0] });
    const duplicate = island({ id: 2, islandVector: [0.999, 0.001] });
    const distinct = island({ id: 3, islandVector: [0, 1] });
    mocks.islandFindAll.mockResolvedValue([strongest, duplicate, distinct]);
    mocks.query.mockResolvedValue([{ islandId: 3, name: 'Quantum Cameras' }]);
    mocks.islandTopicFindAll.mockResolvedValue([
      { islandId: 1, topicCount: 3 },
      { islandId: 2, topicCount: 1 },
      { islandId: 3, topicCount: 1 }
    ]);

    const result = await disambiguateDuplicateIslandNamesForUser(8, { transaction: 'tx' });

    expect(duplicate.update).toHaveBeenCalledWith(expect.objectContaining({
      archivedInd: true,
      archivedAt: expect.any(Date)
    }), { transaction: 'tx' });
    expect(distinct.update).toHaveBeenCalledWith({ label: 'Technology: Quantum Cameras' }, { transaction: 'tx' });
    expect(result.archived).toEqual([2]);
    expect(result.renamed).toEqual([expect.objectContaining({
      islandId: 3,
      strongerIslandId: 1,
      to: 'Technology: Quantum Cameras'
    })]);
  });

  it('returns an empty summary without relationship queries when there are no active islands', async () => {
    mocks.islandFindAll.mockResolvedValue([]);

    await expect(disambiguateDuplicateIslandNamesForUser(8)).resolves.toEqual({ renamed: [], archived: [] });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.islandTopicFindAll).not.toHaveBeenCalled();
  });
});
