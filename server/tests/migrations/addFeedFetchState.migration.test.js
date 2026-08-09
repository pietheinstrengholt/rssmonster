import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260809000000-add-feed-fetch-state.js';

// Creates the Sequelize type stubs used to inspect migration column contracts.
const createSequelizeTypes = () => ({
  STRING: vi.fn(length => `STRING(${length})`),
  DATE: 'DATE',
  BIGINT: 'BIGINT',
  INTEGER: 'INTEGER'
});

describe('add feed fetch state migration', () => {
  it('adds nullable fetch metadata with generous string capacities', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };
    const Sequelize = createSequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    expect(Sequelize.STRING).toHaveBeenCalledWith(2048);
    expect(Sequelize.STRING).toHaveBeenCalledWith(1024);
    expect(Sequelize.STRING).toHaveBeenCalledWith(128);
    expect(Sequelize.STRING).toHaveBeenCalledWith(64);

    const nullableFields = [
      'etag',
      'lastModified',
      'contentHash',
      'cacheFreshUntil',
      'lastAttemptAt',
      'lastSuccessAt',
      'lastChangedAt',
      'lastPublishedAt',
      'observedEntryIntervalMs',
      'nextFetchAt',
      'lastFetchOutcome'
    ];
    for (const field of nullableFields) {
      expect(queryInterface.addColumn).toHaveBeenCalledWith(
        'feeds',
        field,
        expect.objectContaining({ allowNull: true, defaultValue: null })
      );
    }

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'feeds',
      'consecutiveFailures',
      expect.objectContaining({
        type: 'INTEGER',
        allowNull: false,
        defaultValue: 0
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'feeds',
      ['status', 'nextFetchAt'],
      { name: 'feeds_status_nextFetchAt_idx' }
    );
  });

  it('removes the scheduling index before all fetch-state columns', async () => {
    const queryInterface = {
      removeIndex: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'feeds',
      'feeds_status_nextFetchAt_idx'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledTimes(12);
    expect(queryInterface.removeIndex.mock.invocationCallOrder[0]).toBeLessThan(
      queryInterface.removeColumn.mock.invocationCallOrder[0]
    );
  });
});
