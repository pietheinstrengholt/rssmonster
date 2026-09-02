import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260902000000-add-feed-item-filter.js'
);

describe('feed item filter migration', () => {
  it('adds a nullable item filter', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'feeds',
      'itemFilter',
      expect.objectContaining({
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      })
    );
  });

  it('removes the item filter on rollback', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn).toHaveBeenCalledWith('feeds', 'itemFilter');
  });
});
