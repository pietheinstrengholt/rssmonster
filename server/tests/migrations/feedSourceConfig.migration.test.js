import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/pre-2.4/20260904003000-add-feed-source-config.js'
);

describe('feed source config migration', () => {
  it('adds nullable JSON source configuration', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'feeds',
      'sourceConfig',
      expect.objectContaining({
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      })
    );
  });

  it('removes source configuration on rollback', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn).toHaveBeenCalledWith('feeds', 'sourceConfig');
  });
});
